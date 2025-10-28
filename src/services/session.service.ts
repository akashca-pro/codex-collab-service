import { injectable, inject } from 'inversify';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { config } from '@/config';
import TYPES from '@/config/inversify/types';
import { ISessionRepo } from '@/db/repos/interfaces/session.repo.interface';
import { ISessionService } from './interfaces/session.service.interface';
import { ResponseDTO } from '@/dtos/ResponseDTO';
import { SESSION_ERROR_MESSAGES } from '@/const/errorType.const';
import { RedisService } from './Redis.service';
import { ActiveDocsMap, ActiveSessionMetadata } from '@/types/document.types';
import { ISnapshotRepo } from '@/db/repos/interfaces/snapshot.repo.interface';
import { ServerInitialState, YjsUpdate } from '@/types/client-server.types';
import { CollaborationOpLog } from '@/types/kafka.types';
import { KafkaTopics } from '@/config/kafka/kafkaTopic';
import { KafkaManager } from '@/config/kafka/kafkaManager';
import jwt from 'jsonwebtoken';
import { InviteTokenPayload } from '@/types/tokenPayload.types';
import { LANGUAGE, Language } from '@/const/language.const';
import logger from '@/utils/pinoLogger';

@injectable()
export class SessionService implements ISessionService  {
    #_sessionRepo : ISessionRepo
    #_snapshotRepo : ISnapshotRepo
    #_redisService : RedisService
    #_kafkaManager : KafkaManager
    #_activeDocs : ActiveDocsMap = new Map();
    #_activeAwareness: Map<string, Awareness> = new Map(); 
    #_activeSessionMetadata: Map<string, ActiveSessionMetadata> = new Map();

    constructor(
        @inject(TYPES.ISessionRepo) sessionRepo : ISessionRepo,
        @inject(TYPES.ISnapshotRepo) snapshotRepo : ISnapshotRepo,
        @inject(TYPES.RedisService) redisService : RedisService,
        @inject(TYPES.KafkaManager) kafkaManager : KafkaManager,
    ){
      this.#_sessionRepo = sessionRepo
      this.#_snapshotRepo = snapshotRepo,
      this.#_redisService = redisService,
      this.#_kafkaManager = kafkaManager
    }

    async createSession(ownerId: string): Promise<ResponseDTO> {
    try {
        const isActiveSessionExist = await this.#_sessionRepo.findActiveSessionByOwnerId(ownerId);
        if(isActiveSessionExist){
            return {
                data : null,
                success : false,
                errorMessage : SESSION_ERROR_MESSAGES.SESSION_ALREADY_EXIST
            }
        }
        const session = await this.#_sessionRepo.create({
          ownerId,
        })
        const inviteToken = this.generateInviteToken(session._id, ownerId);
        return {
          data : { inviteToken },
          success : true,
        }
      } catch (error) {
        console.log(error);
        logger.error('Failed to create session.', { error });
        return { data: null, success: false, errorMessage: 'A server error occurred while creating the session.' };
      }
    }

    async joinSession(
      socket : Socket,
      io : Server
    ): Promise<void> {
    try {
        const { userId, sessionId } = socket.data;
        if (!userId || !sessionId) { 
             logger.warn('joinSession called with missing userId or sessionId on socket.data');
             throw new Error('User or Session ID missing during join.');
        }
        logger.info(`Attempting joinSession for user ${userId} in session ${sessionId}`);
        socket.join(sessionId);
        await this.#_redisService.addParticipantToSession(sessionId, userId);
        logger.debug(`Added participant ${userId} to Redis set for session ${sessionId}`);
        await this.#_redisService.setUserSocketInfo(userId, {
          podName : config.PODNAME,
          socketId : socket.id
        });
        logger.debug(`Set user socket info for ${userId}`);

        const { doc, awareness } = await this.getOrLoadSessionState(sessionId, io);
        logger.debug(`Got doc and awareness for session ${sessionId}`);

        const docUpdate = Y.encodeStateAsUpdate(doc);
        const awarenessUpdate = encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()));
        const initialState: ServerInitialState = { docUpdate, awarenessUpdate };
        socket.emit('initial-state', initialState);
        logger.info(`Emitted initial-state to user ${userId} for session ${sessionId}`);
      } catch (error: any) { 
        logger.error(`Error during joinSession for user ${socket.data.userId || 'UNKNOWN'}.`, {
            sessionId: socket.data.sessionId,
            errorMessage: error.message,
            errorStack: error.stack,
            errorObject: error
         });
        socket.emit('error', { message: 'Failed to initialize the session on the server.' });
        socket.disconnect(true);
      }
    }

    async handleAwarenessUpdate(
      socket: Socket,
      update: YjsUpdate
    ): Promise<void> {
        const { sessionId } = socket.data;
        const awareness = this.#_activeAwareness.get(sessionId);
        if (awareness) {
            applyAwarenessUpdate(awareness, update, socket.id);
          socket.broadcast.to(sessionId).emit('awareness-update', update);
        }else{
          logger.warn(`No awareness found for session ${sessionId} during handleAwarenessUpdate`);
          return;
        }
    }

    async updateDocument(
      socket : Socket,
      update: YjsUpdate,
      io : Server
    ): Promise<void> {
        const { sessionId } = socket.data;
        const { doc } = await this.getOrLoadSessionState(sessionId, io);
        Y.applyUpdate(doc, update, socket.id);
        socket.broadcast.to(sessionId).emit('doc-update', update);
    }

    async leaveSession(
      socket: Socket,
    ): Promise<void> {
      const { userId, sessionId } = socket.data;
      if (!userId || !sessionId) {
          logger.warn('leaveSession called without userId or sessionId on socket data.');
          return; // Nothing to do if we don't know who/where
      }
      logger.info(`Attempting leaveSession for user ${userId} from session ${sessionId}`);
      try {
        socket.leave(sessionId);

        // Promise.all to run DB and Redis removal concurrently
        await Promise.all([
             this.#_sessionRepo.removeParticipant(sessionId, userId),
             this.#_redisService.removeParticipantFromSession(sessionId, userId)
        ]);
        logger.debug(`Removed participant ${userId} from DB and Redis for session ${sessionId}`);

        const awareness = this.#_activeAwareness.get(sessionId);
        if (awareness) {
          const states = Array.from(awareness.getStates().entries());
          const disconnectedEntry = states.find(([, state]) => state.user?.id === userId);

          if (disconnectedEntry) {
            const clientID = disconnectedEntry[0];
            logger.debug(`Removing awareness state for clientID ${clientID} (user ${userId})`);
            removeAwarenessStates(awareness, [clientID], socket);
            const removalUpdate = encodeAwarenessUpdate(awareness, [clientID]);
            socket.broadcast.to(sessionId).emit('awareness-update', removalUpdate);
             logger.debug(`Published awareness removal for user ${userId} to Redis`);
          } else {
             logger.warn(`Could not find awareness state for disconnecting user ${userId} in session ${sessionId}`);
          }
        } else {
            logger.warn(`No active awareness found for session ${sessionId} during leave.`);
        }

        // Check participant count AFTER potential awareness update publication
        const participantCount = await this.#_redisService.getParticipantCount(sessionId);
        logger.info(`Participant count for session ${sessionId} after leave: ${participantCount}`);

        if (participantCount === 0) {
          logger.info(`Last participant left session ${sessionId}. Cleaning up resources.`);
          const doc = this.#_activeDocs.get(sessionId);
          const currentAwareness = this.#_activeAwareness.get(sessionId); // Get again in case it was created between checks

          if (doc) {
            try {
                const finalState = Y.encodeStateAsUpdate(doc);
                const language = this.#_activeSessionMetadata.get(sessionId)?.language;
                await this.#_snapshotRepo.saveSnapshot(sessionId, Buffer.from(finalState), language || LANGUAGE.JAVASCRIPT); // Provide default lang
                logger.info(`Saved final snapshot for session ${sessionId}`);
            } catch (snapError: any) {
                 logger.error(`Failed to save snapshot for session ${sessionId} during cleanup.`, { errorMessage: snapError.message, errorStack: snapError.stack });
            } finally {
                 // Ensure cleanup happens even if snapshot fails
                 doc.destroy();
                 currentAwareness?.destroy();
                 this.#_activeDocs.delete(sessionId);
                 this.#_activeAwareness.delete(sessionId);
                 this.#_activeSessionMetadata.delete(sessionId); // Also clear metadata
                 logger.info(`Destroyed Y.Doc and Awareness for session ${sessionId}`);
            }
          } else {
             logger.warn(`Participant count is 0, but no active doc found for session ${sessionId} to clean up.`);
             currentAwareness?.destroy();
             this.#_activeDocs.delete(sessionId);
             this.#_activeAwareness.delete(sessionId);
             this.#_activeSessionMetadata.delete(sessionId);
          }
        }
      } catch (error: any) {
        logger.error(`Error during leaveSession for user ${userId} in session ${sessionId}.`, {
            errorMessage: error.message,
            errorStack: error.stack,
            errorObject: error
        });
      }
    }

    async closeSession(
      socket: Socket,
      io : Server
    ): Promise<void> {
      const { userId, sessionId } = socket.data;
      try {
      const session = await this.#_sessionRepo.findSessionById(sessionId);
      if (!session || session.ownerId !== userId) {
        socket.emit('error', { message: 'Session not found or unauthenticated for close the session.' });
        return;
      }
      const awareness = this.#_activeAwareness.get(sessionId);
      const doc = this.#_activeDocs.get(sessionId);
      if (doc) {
        const finalState = Y.encodeStateAsUpdate(doc);
        const language = this.#_activeSessionMetadata.get(sessionId)?.language
        await this.#_snapshotRepo.saveSnapshot(sessionId, Buffer.from(finalState), language || 'javascript');
        doc.destroy();
        awareness?.destroy(); 
        this.#_activeDocs.delete(sessionId);
        this.#_activeAwareness.delete(sessionId);
        this.#_activeSessionMetadata.delete(sessionId);
      }
      await Promise.all([
        await this.#_sessionRepo.closeSession(sessionId, userId),
        await this.#_redisService.publishSessionClosed(sessionId)
      ])
      io.in(sessionId).disconnectSockets(true);
      } catch (error) {
        logger.error(`Error during closeSession for user ${userId} in session ${sessionId}.`, { error });
        socket.emit('error', { message: 'Failed to close the session due to a server error.' });
      }
    }

    async changeLanguage(
      socket: Socket,
      io: Server,
      language: Language
    ): Promise<void> {
        const { userId, sessionId } = socket.data;
      try {
        const session = await this.#_sessionRepo.findSessionById(sessionId);
        if (!session || session.ownerId !== userId) {
          socket.emit('error', { message: 'Only the session owner can change the language.' });
          return;
        }
        const metadata = this.#_activeSessionMetadata.get(sessionId);
        if (!metadata) {
          socket.emit('error', { message: 'Session not found or inactive.' });
          return;
        }
        if (metadata) {
          metadata.language = language;
        }
        await this.#_sessionRepo.updateSessionDetails(sessionId, {language})
        await this.#_redisService.publishMetadataUpdate(sessionId, metadata);
      } catch (error) {
        logger.error(`Error during changeLanguage for user ${userId} in session ${sessionId}.`, { error });
        socket.emit('error', { message: 'Failed to change the language due to a server error.' });
      }
    }    

  private async getOrLoadSessionState(
    sessionId: string, 
    io : Server
  ) : Promise<{doc: Y.Doc, awareness: Awareness}> {
    if (this.#_activeDocs.has(sessionId)) {
        return {
            doc: this.#_activeDocs.get(sessionId)!,
            awareness: this.#_activeAwareness.get(sessionId)!
        };
    }
    if (!this.#_activeSessionMetadata.has(sessionId)) {
      const session = await this.#_sessionRepo.findSessionById(sessionId);
      if (session) {
        this.#_activeSessionMetadata.set(sessionId, {
          language: session.language,
          ownerId: session.ownerId
        });
      }
    }
    const doc = new Y.Doc();
    this.#_activeDocs.set(sessionId, doc);

    const awareness = new Awareness(doc);
    this.#_activeAwareness.set(sessionId, awareness);

    await this.#_redisService.subscribeToMetadataUpdates(sessionId, (incomingMetadata: ActiveSessionMetadata) => {
      this.#_activeSessionMetadata.set(sessionId, incomingMetadata);
      io.to(sessionId).emit('metadata-changed', incomingMetadata);
    });
    await this.#_redisService.subscribeToSessionClosed(sessionId, (payload : {sessionId : string})=>{
      this.cleanupSessionMemory(sessionId);
      io.to(sessionId).emit('close-session');
      io.in(sessionId).disconnectSockets(true);
    })

    // This is for restore the session if all users disconnect by network issue.
    const snapshot = await this.#_snapshotRepo.getLatestSnapshot(sessionId);
    if (snapshot) {
        Y.applyUpdate(doc, new Uint8Array(snapshot), 'redis');
    }
    return { doc, awareness };
  }

  private async logOperation(opLog: CollaborationOpLog, sessionId : string): Promise<void> {
    await this.#_kafkaManager.sendMessage(
        KafkaTopics.COLLABORATION_OPS_LOG,
        sessionId,
        opLog
    );
  }

  private generateInviteToken(sessionId: string, ownerId : string): string {
    const payload: InviteTokenPayload = { 
      sessionId,
      ownerId
    };
    
    return jwt.sign(payload, config.JWT_INVITE_TOKEN_SECRET, {
      expiresIn: '1h',
    });
  }

  private async cleanupSessionMemory(sessionId: string): Promise<void> {
    const doc = this.#_activeDocs.get(sessionId);
    const awareness = this.#_activeAwareness.get(sessionId);

    try {
      if (doc) doc.destroy();
      if (awareness) awareness.destroy();
      this.#_activeDocs.delete(sessionId);
      this.#_activeAwareness.delete(sessionId);
      this.#_activeSessionMetadata.delete(sessionId);
      logger.info(`Cleaned up local session state for ${sessionId}`);
    } catch (err) {
      logger.error(`Error cleaning up local state for session ${sessionId}`, err);
    }
  }

  public async shutdownAndSaveAllSessions(): Promise<void> {
    logger.info(`Graceful shutdown initiated. Saving all active sessions...`);
    const activeSessionIds = Array.from(this.#_activeDocs.keys());
    
    if (activeSessionIds.length === 0) {
      logger.info('No active sessions to save. Shutting down.');
      return;
    }

    const savePromises = activeSessionIds.map(async (sessionId) => {
      const doc = this.#_activeDocs.get(sessionId);
      const metadata = this.#_activeSessionMetadata.get(sessionId);

      if (doc && metadata) {
        try {
          const finalState = Y.encodeStateAsUpdate(doc);
          await this.#_snapshotRepo.saveSnapshot(
            sessionId,
            Buffer.from(finalState),
            metadata.language
          );
          logger.info(`Successfully saved snapshot for session ${sessionId}.`);
        } catch (error) {
          logger.error(`Failed to save snapshot for session ${sessionId} during shutdown.`, { error });
        }
      }
    });

    await Promise.all(savePromises);
    logger.info(`Finished saving ${activeSessionIds.length} active sessions.`);
    }
}