import { injectable, inject } from 'inversify';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { config } from '@/config';
import TYPES from '@/config/inversify/types';
import { ISessionRepo } from '@/db/repos/interfaces/session.repo.interface';
import { ISessionService } from './interfaces/session.service.interface';
import { ResponseDTO } from '@/dtos/ResponseDTO';
import { RedisService } from './Redis.service';
import { ActiveDocsMap } from '@/types/document.types';
import { ActiveSessionMetadata } from '@/const/events.const'
import { ISnapshotRepo } from '@/db/repos/interfaces/snapshot.repo.interface';
import { ServerInitialState, YjsUpdate } from '@/types/client-server.types';
import { CollaborationOpLog } from '@/types/kafka.types';
import { KafkaTopics } from '@/config/kafka/kafkaTopic';
import { KafkaManager } from '@/config/kafka/kafkaManager';
import jwt from 'jsonwebtoken';
import { InviteTokenPayload } from '@/types/tokenPayload.types';
import { LANGUAGE } from '@/const/language.const';
import logger from '@/utils/pinoLogger';
import { ChatMessage, RunCodeMessage } from '@/const/events.const';
import { randomUUID } from 'node:crypto';

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
        const isActiveSessionExist = await this.#_sessionRepo.findActiveOrOfflineSessionByOwnerId(ownerId);
        if(isActiveSessionExist){
            return {
                data : { inviteToken : isActiveSessionExist.inviteToken },
                success : true,
            }
        }
        const session = await this.#_sessionRepo.create({
          ownerId,
        })
        const inviteToken = this.generateInviteToken(session._id, ownerId);
        await this.#_sessionRepo.update(session._id, { inviteToken })
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
        const { userId, sessionId, username } = socket.data;
        if (!userId || !sessionId || !username) {
             logger.warn('joinSession called with missing userId or sessionId on socket.data');
             socket.emit('error', { message: 'User or Session ID missing during join.' });
        }
        logger.info(`Attempting joinSession for user ${userId} in session ${sessionId}`);
        const session = await this.#_sessionRepo.findSessionById(sessionId);
        if(session?.status === 'ended'){
          socket.emit('error', {message : 'Session is either ended or closed'})
          socket.disconnect(true); 
          return;
        }
        socket.join(sessionId);
        io.to(sessionId).emit('user-joined', { username });
        await this.#_redisService.addParticipantToSession(sessionId, userId);
        logger.debug(`Added participant ${userId} to Redis set for session ${sessionId}`);
        await this.#_redisService.setUserSocketInfo(userId, {
          podName : config.PODNAME,
          socketId : socket.id
        });
        logger.debug(`Set user socket info for ${userId}`);

        // If no in-memory state exists (e.g., after last-leave or pod restart), restore from snapshot
        let snapshotLoaded = false;
        let doc = this.#_activeDocs.get(sessionId);
        let awareness = this.#_activeAwareness.get(sessionId);
        let metadata = this.#_activeSessionMetadata.get(sessionId)
        if (!doc || !awareness) {
            const restored = await this.restoreSession(sessionId, io);
            if (restored) {
                doc = restored.doc;
                awareness = restored.awareness;
                snapshotLoaded = restored.snapshotLoaded; // reflect actual snapshot application
                metadata = this.#_activeSessionMetadata.get(sessionId) || metadata;
            } else {
                // As a fallback, try to get state
                const loaded = await this.getOrLoadSessionState(sessionId, io);
                doc = loaded.doc;
                awareness = loaded.awareness;
                snapshotLoaded = loaded.snapshotLoaded;
                metadata = loaded.metadata;
            }
        }
        logger.debug(`Got doc and awareness for session ${sessionId}. Snapshot loaded: ${snapshotLoaded}`);

        // Clean up any lingering state for this user (handles rapid reconnects)
        const existingClientIDs = Array.from(awareness.getStates().entries())
                                      .filter(([, state]) => state.user?.id === userId)
                                      .map(([clientID]) => clientID);

        if (existingClientIDs.length > 0) {
            logger.warn(`Found lingering awareness state for rejoining user ${userId} (ClientIDs: ${existingClientIDs.join(', ')}). Cleaning up before sending initial state.`);
            removeAwarenessStates(awareness, existingClientIDs, 'server-join-cleanup');
        }

        // --- Initial State ---
        const docUpdate = Y.encodeStateAsUpdate(doc);
        logger.debug(`initial-state docUpdate bytes for session ${sessionId}: ${docUpdate.byteLength}; snapshotLoaded=${snapshotLoaded}`);
        let awarenessUpdate: YjsUpdate;

        if (snapshotLoaded) {
            // If restored from snapshot, send an empty awareness state initially.
            // The client will establish its own state upon connection.
            logger.debug(`Session ${sessionId} restored from snapshot. Sending empty initial awareness.`);
            awarenessUpdate = encodeAwarenessUpdate(awareness, []); // Encode for NO clients
        } else {
            // If session was active, send the current full awareness state.
            // Ensure we get the *current* keys after potential cleanup.
            const currentAwarenessKeys = Array.from(awareness.getStates().keys());
            logger.debug(`Session ${sessionId} was active. Sending awareness for clients: ${currentAwarenessKeys.join(', ')}`);
            awarenessUpdate = encodeAwarenessUpdate(awareness, currentAwarenessKeys);
        }

        const initialState: ServerInitialState = { docUpdate, awarenessUpdate };
        socket.emit('initial-state', initialState);
        logger.info(`Emitted initial-state to user ${userId} for session ${sessionId}`);

        // Emit current metadata to the client so UI can sync settings
        const currentMetadata = this.#_activeSessionMetadata.get(sessionId);
        if (currentMetadata) {
          socket.emit('metadata-changed', currentMetadata);
        }

        // Mark session status ACTIVE if not ended/closed
        try {
          const session = await this.#_sessionRepo.findSessionById(sessionId);
          const now = Date.now();
          if (session) {
            if (!session.isClosed && session.endsAt && now < new Date(session.endsAt).getTime()) {
              if (session.status !== 'active') {
                await this.#_sessionRepo.updateSessionDetails(sessionId, { status: 'active' as any });
              }
            } else if (session.endsAt && now >= new Date(session.endsAt).getTime()) {
              if (session.status !== 'ended') {
                await this.#_sessionRepo.updateSessionDetails(sessionId, { status: 'ended' as any });
              }
            }
          }
        } catch {}

      } catch (error: any) {
        logger.error(`Error during joinSession for user ${socket.data.userId || 'UNKNOWN'}.`, {
            sessionId: socket.data.sessionId,
            errorMessage: error.message,
            errorStack: error.stack,
            errorObjectString: String(error)
         });
        socket.emit('error', { message: 'Failed to initialize the session on the server.' });
        socket.disconnect(true); // Disconnect client on error
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
          socket.to(sessionId).emit('awareness-update', update);
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
        socket.to(sessionId).emit('doc-update', update);
    }

    async leaveSession(
      socket: Socket,
      io : Server
    ): Promise<void> {
      const { userId, sessionId, username } = socket.data;
      if (!userId || !sessionId) {
          logger.warn('leaveSession called without userId or sessionId on socket data.');
          return;
      }
      logger.info(`Attempting leaveSession for user ${userId} from session ${sessionId}`);
      try {
        socket.leave(sessionId);
        io.to(sessionId).emit('user-left', { username });
        await Promise.all([
             this.#_sessionRepo.removeParticipant(sessionId, userId),
             this.#_redisService.removeParticipantFromSession(sessionId, userId)
        ]);
        logger.debug(`Removed participant ${userId} from DB and Redis for session ${sessionId}`);

        const awareness = this.#_activeAwareness.get(sessionId);
        if (awareness) {
          const states = Array.from(awareness.getStates().entries());
          const disconnectedEntry = states.find(([, state]) => state.user?.id === userId);
          logger.debug('disconnected entry',disconnectedEntry)
          if (disconnectedEntry) {
            const clientID = disconnectedEntry[0];
            logger.debug(`Removing awareness state for clientID ${clientID} (user ${userId})`);
            removeAwarenessStates(awareness, [clientID], socket);
            const removalUpdate = encodeAwarenessUpdate(awareness, [clientID]);
            socket.to(sessionId).emit('awareness-update', removalUpdate);
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
          // Update session status when room is empty
          try {
            const session = await this.#_sessionRepo.findSessionById(sessionId);
            const now = Date.now();
            if (session) {
              if (session.isClosed || (session.endsAt && now >= new Date(session.endsAt).getTime())) {
                if (session.status !== 'ended') {
                  await this.#_sessionRepo.updateSessionDetails(sessionId, { status: 'ended' as any });
                }
              } else {
                if (session.status !== 'offline') {
                  await this.#_sessionRepo.updateSessionDetails(sessionId, { status: 'offline' as any });
                }
              }
            }
          } catch {}
          const doc = this.#_activeDocs.get(sessionId);
          const currentAwareness = this.#_activeAwareness.get(sessionId); // Get again in case it was created between checks

          if (doc) {
            try {
                const finalState = Y.encodeStateAsUpdate(doc);
                const meta = this.#_activeSessionMetadata.get(sessionId);
                // De-dupe: skip save if snapshot hasn't changed
                const latest = await this.#_snapshotRepo.getLatestSnapshot(sessionId);
                if (!latest || !Buffer.from(latest).equals(Buffer.from(finalState))) {
                  await this.#_snapshotRepo.saveSnapshot(
                    sessionId,
                    Buffer.from(finalState),
                    (meta?.language) || LANGUAGE.JAVASCRIPT,
                    (meta?.fontSize) ?? 16,
                    (meta?.intelliSense) ?? false
                  );
                  logger.info(`Saved final snapshot for session ${sessionId}`);
                } else {
                  logger.info(`Skipped snapshot save for session ${sessionId} (no changes).`);
                }
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
        socket.emit('error', { message: 'Session not found or unauthenticated for closing the session.' });
        return;
      }
      const awareness = this.#_activeAwareness.get(sessionId);
      const doc = this.#_activeDocs.get(sessionId);
      if (doc) {
        const finalState = Y.encodeStateAsUpdate(doc);
        const meta = this.#_activeSessionMetadata.get(sessionId)
        // De-dupe snapshot before save on explicit close
        const latest = await this.#_snapshotRepo.getLatestSnapshot(sessionId);
        if (!latest || !Buffer.from(latest).equals(Buffer.from(finalState))) {
          await this.#_snapshotRepo.saveSnapshot(
            sessionId,
            Buffer.from(finalState),
            (meta?.language) || LANGUAGE.JAVASCRIPT,
            (meta?.fontSize) ?? 16,
            (meta?.intelliSense) ?? false
          );
        }
        doc.destroy();
        awareness?.destroy(); 
        this.#_activeDocs.delete(sessionId);
        this.#_activeAwareness.delete(sessionId);
        this.#_activeSessionMetadata.delete(sessionId);
      }
        await this.#_sessionRepo.closeSession(sessionId, userId),
        await this.#_sessionRepo.updateSessionDetails(sessionId, { status: 'ended', isClosed: true, endsAt: new Date() }),
        io.in(sessionId).disconnectSockets(true);
      } catch (error) {
        logger.error(`Error during closeSession for user ${userId} in session ${sessionId}.`, { error });
        socket.emit('error', { message: 'Failed to close the session due to a server error.' });
      }
    } 

    async changeMetadata(
      socket: Socket,
      io: Server,
      message: Partial<ActiveSessionMetadata>
    ): Promise<void> {
      const { userId, sessionId } = socket.data;
      try {
        const metadata = this.#_activeSessionMetadata.get(sessionId);
        if (!metadata) {
          socket.emit('error', { message: 'Session not found or inactive.' });
          return;
        }

        const updates: Partial<ActiveSessionMetadata> = {};

        if (typeof message.fontSize === 'number') {
          if (message.fontSize >= 9 && message.fontSize <= 64) {
            metadata.fontSize = message.fontSize;
            updates.fontSize = message.fontSize;
          } else {
            socket.emit('error', { message: 'Invalid font size.' });
            return;
          }
        }

        if (typeof message.intelliSense === 'boolean') {
          metadata.intelliSense = message.intelliSense;
          updates.intelliSense = message.intelliSense;
        }

        if (typeof message.language === 'string') {
          metadata.language = message.language;
          updates.language = message.language;
        }

        if (Object.keys(updates).length === 0) {
          return;
        }

        await this.#_sessionRepo.updateSessionDetails(sessionId, updates);
        io.to(sessionId).emit('metadata-changed', metadata);

      } catch (error) {
        logger.error(`Error during changeMetadata for user ${userId} in session ${sessionId}.`, { error });
        socket.emit('error', { message: 'Failed to change the metadata due to a server error.' });
      }
    }

    async codeExecution(
      socket: Socket, 
      io: Server, 
      message: RunCodeMessage
    ): Promise<void> {
      const { sessionId } = socket.data;
      if(message.type === 'running-code'){
        io.to(sessionId).emit('code-executing',message.payload);
      }
      if(message.type === 'result-updated'){
        io.to(sessionId).emit('code-executed',message.payload);
      }
    }

    async handleChatMessage(
      socket: Socket,
      io: Server,
      content: string
    ): Promise<void> {
      const { sessionId, userId, username } = socket.data;

      if (!content || content.trim().length === 0) {
        return;
      }

      const uniqueId = randomUUID()
      const awareness = this.#_activeAwareness.get(sessionId);
      let avatar = '';  
      let firstName = ''

      if (awareness) {
          const states = Array.from(awareness.getStates().values());
          const userState = states.find(state => state.user?.id === userId);
          if (userState && userState.user?.avatar) {
            avatar = userState.user.avatar;
          }
          if (userState && userState.user?.firstName){
            firstName = userState.user.firstName
          }
        }
      
      const message: ChatMessage = {
        id: uniqueId,
        userId,
        username: username || `User_${uniqueId}`,
        avatar,
        firstName,
        content: content.trim(),
        timestamp: Date.now(),
      };

      io.to(sessionId).emit('new-chat-message', message);
      logger.debug(`User ${userId} sent chat message in session ${sessionId}`);
    }

  private async getOrLoadSessionState(
    sessionId: string, 
    io : Server
  ) : Promise<{doc: Y.Doc, awareness: Awareness, snapshotLoaded: boolean, metadata : ActiveSessionMetadata }> {
    if (this.#_activeDocs.has(sessionId) ) {
        return {
            doc: this.#_activeDocs.get(sessionId)!,
            awareness: this.#_activeAwareness.get(sessionId)!,
            metadata : this.#_activeSessionMetadata.get(sessionId)!,
            snapshotLoaded : false
        };
    }

    let snapshotLoaded = false; 
    
    const doc = new Y.Doc();
    this.#_activeDocs.set(sessionId, doc);

    const awareness = new Awareness(doc);
    this.#_activeAwareness.set(sessionId, awareness);

    // This is for restore the session if all users disconnect by network issue.
    const snapshot = await this.#_snapshotRepo.getLatestSnapshot(sessionId);
      if (snapshot) {
          const snapUint8 = snapshot instanceof Uint8Array 
            ? snapshot 
            : new Uint8Array((snapshot as Buffer).buffer, (snapshot as Buffer).byteOffset, (snapshot as Buffer).byteLength);
          logger.debug(`Applying snapshot to new doc for session ${sessionId}. Snapshot bytes: ${(snapUint8 as Uint8Array).byteLength}`);
          Y.applyUpdate(doc, snapUint8 as Uint8Array, 'snapshot-load');
          snapshotLoaded = true; 
      } else {
          logger.debug(`No snapshot found for session ${sessionId}. Starting with empty doc.`);
      }

    let metadata = await this.#_snapshotRepo.getLatestMetadata(sessionId);
    if (!metadata) {
      const session = await this.#_sessionRepo.findSessionById(sessionId);
      if (session) {
        metadata = {
          language: session.language,
          fontSize: session.fontSize,
          intelliSense: session.intelliSense,
        };
      } else {
        metadata = {
          language: LANGUAGE.JAVASCRIPT,
          fontSize: 16,
          intelliSense: false,
        };
      }
    }
    this.#_activeSessionMetadata.set(sessionId, metadata);
    return { doc, awareness, snapshotLoaded, metadata };
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

  private async restoreSession(sessionId: string, io: Server) : Promise<{ doc: Y.Doc; awareness: Awareness; snapshotLoaded: boolean } | null> {
    try {
      // Ensure any stale in-memory state is removed first
      await this.cleanupSessionMemory(sessionId);

      // Recreate state from snapshot
      const { doc, awareness, snapshotLoaded } = await this.getOrLoadSessionState(sessionId, io);
      logger.info(`Restored session ${sessionId} from ${snapshotLoaded ? 'snapshot' : 'empty state'} and rebuilt local state.`);
      return { doc, awareness, snapshotLoaded };
    } catch (error: any) {
      logger.error(`Failed to restore session ${sessionId} from snapshot.`, { errorMessage: error.message, errorStack: error.stack });
      return null;
    }
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
      expiresIn: config.JWT_INVITE_TOKEN_EXPIRY as '24h',
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
          // De-dupe: skip save if unchanged
          const latest = await this.#_snapshotRepo.getLatestSnapshot(sessionId);
          if (!latest || !Buffer.from(latest).equals(Buffer.from(finalState))) {
            await this.#_snapshotRepo.saveSnapshot(
              sessionId,
              Buffer.from(finalState),
              metadata.language,
              metadata.fontSize,
              metadata.intelliSense
            );
            logger.info(`Successfully saved snapshot for session ${sessionId}.`);
          } else {
            logger.info(`Skipped snapshot save during shutdown for session ${sessionId} (no changes).`);
          }
        } catch (error) {
          logger.error(`Failed to save snapshot for session ${sessionId} during shutdown.`, { error });
        }
      }
    });

    await Promise.all(savePromises);
    logger.info(`Finished saving ${activeSessionIds.length} active sessions.`);
  }
}