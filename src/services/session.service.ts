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
import { randomUUID } from 'crypto';
import { InviteTokenPayload } from '@/types/tokenPayload.types';
import { Language } from '@/const/language.const';
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
        @inject(TYPES.ISessionRepo) sessionRepo : ISessionRepo
    ){
      this.#_sessionRepo = sessionRepo
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
        const inviteToken = this.generateInviteToken(session._id.toString());
        return {
          data : { inviteToken },
          success : true,
        }
      } catch (error) {
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
        socket.join(sessionId);
        await this.#_redisService.addParticipantToSession(sessionId, userId);
        await this.#_redisService.setUserSocketInfo(userId, {
          podName : config.PODNAME,
          socketId : socket.id
        })
        const { doc, awareness } = await this.getOrLoadSessionState(sessionId, io);
        const docUpdate = Y.encodeStateAsUpdate(doc);
        const awarenessUpdate = encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()));
        const initialState: ServerInitialState = { docUpdate, awarenessUpdate };
        socket.emit('initial-state', initialState);
      } catch (error) {
        logger.error(`Error during joinSession for user ${socket.data.userId}.`, { error });
        socket.emit('error', { message: 'Failed to join the session due to a server error.' });
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
          try {
            await this.#_redisService.publishAwarenessUpdate(sessionId, update);
          } catch (error) {
            socket.emit('error', {
            message: 'Your recent change could not be saved due to a server issue. Please try refreshing.',
            code: 500
          });  
          }
        }
    }

    async updateDocument(
      socket : Socket,
      update: YjsUpdate,
      io : Server
    ): Promise<void> {
        const { userId, sessionId } = socket.data;
        const { doc } = await this.getOrLoadSessionState(sessionId, io);
        Y.applyUpdate(doc, update, socket.id);
        this.logOperation({
          eventId: randomUUID(),
          timestamp: new Date().toISOString(),
          sessionId,
          userId,
          operation: Buffer.from(update).toString('base64'),
        }, sessionId);
        try {
          await this.#_redisService.publishDocUpdate(sessionId, update)
        } catch (error) {
          socket.emit('error', {
          message: 'Your recent change could not be saved due to a server issue. Please try refreshing.',
          code: 500
         });  
        }
    }

    async leaveSession(
      socket: Socket,
    ): Promise<void> {
      const { userId, sessionId } = socket.data;
      if (!userId || !sessionId) return;
      try {
        socket.leave(sessionId);
        await this.#_sessionRepo.removeParticipant(sessionId, userId);
        await this.#_redisService.removeParticipantFromSession(sessionId, userId);

        const awareness = this.#_activeAwareness.get(sessionId);
        if (awareness) {
          const states = Array.from(awareness.getStates().entries());
          const disconnectedEntry = states.find(([, state]) => state.user?.id === userId);

          if (disconnectedEntry) {
            const clientID = disconnectedEntry[0];
            removeAwarenessStates(awareness, [clientID], 'disconnect');
            const removalUpdate = encodeAwarenessUpdate(awareness, [clientID]);
            await this.#_redisService.publishAwarenessUpdate(sessionId, removalUpdate);
          }
        }

        const participantCount = await this.#_redisService.getParticipantCount(sessionId);
        if (participantCount === 0) {
          const doc = this.#_activeDocs.get(sessionId);
          if (doc) {
            const finalState = Y.encodeStateAsUpdate(doc);
            const language = this.#_activeSessionMetadata.get(sessionId)?.language;
            await this.#_snapshotRepo.saveSnapshot(sessionId, Buffer.from(finalState), language!);
            doc.destroy();
            awareness?.destroy();
            this.#_activeDocs.delete(sessionId);
            this.#_activeAwareness.delete(sessionId);
          }
        }
      } catch (error) {
        logger.error(`Error during leaveSession for user ${userId} in session ${sessionId}.`, { error });
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
        socket.emit('error', { message: 'Only the session owner can close the session.' });
        return;
      }
      const awareness = this.#_activeAwareness.get(sessionId);
      const doc = this.#_activeDocs.get(sessionId);
      if (doc) {
        const finalState = Y.encodeStateAsUpdate(doc);
        const language = this.#_activeSessionMetadata.get(sessionId)?.language
        await this.#_snapshotRepo.saveSnapshot(sessionId, Buffer.from(finalState), language!);
        doc.destroy();
        awareness?.destroy(); 
        this.#_activeDocs.delete(sessionId);
        this.#_activeAwareness.delete(sessionId);
        this.#_activeSessionMetadata.delete(sessionId);
      }
      await this.#_sessionRepo.closeSession(sessionId, userId);
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

  private async getOrLoadSessionState(sessionId: string, io : Server): Promise<{doc: Y.Doc, awareness: Awareness}> {
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

    await this.#_redisService.subscribeToAwarenessUpdates(sessionId, (update: YjsUpdate) => {
        applyAwarenessUpdate(awareness, update, 'redis');
        io.to(sessionId).emit('awareness-update', update);
    });
    await this.#_redisService.subscribeToDocUpdates(sessionId, (update: YjsUpdate) => {
        Y.applyUpdate(doc, update, 'redis');
        io.to(sessionId).emit('doc-update', update);
    });
    await this.#_redisService.subscribeToMetadataUpdates(sessionId, (incomingMetadata: ActiveSessionMetadata) => {
      this.#_activeSessionMetadata.set(sessionId, incomingMetadata);
      io.to(sessionId).emit('metadata-changed', incomingMetadata);
    });

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

  private generateInviteToken(sessionId: string): string {
    const payload: InviteTokenPayload = { 
      sessionId, 
    };
    
    return jwt.sign(payload, config.JWT_INVITE_TOKEN_SECRET, {
      expiresIn: '1h',
    });
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