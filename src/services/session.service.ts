import { injectable, inject } from 'inversify';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { config } from '@/config';
import TYPES from '@/config/inversify/types';
import { ISessionRepo } from '@/db/repos/interfaces/session.repo.interface';
import { ISessionService } from './interfaces/session.service.interface';
import { ResponseDTO } from '@/dtos/ResponseDTO';
import { SESSION_ERROR_MESSAGES } from '@/const/errorType.const';
import { RedisService } from './Redis.service';
import { ActiveDocsMap } from '@/types/document.types';
import { ISnapshotRepo } from '@/db/repos/interfaces/snapshot.repo.interface';
import { YjsUpdate } from '@/types/client-server.types';
import { CollaborationOpLog } from '@/types/kafka.types';
import { KafkaTopics } from '@/config/kafka/kafkaTopic';
import { KafkaManager } from '@/config/kafka/kafkaManager';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { InviteTokenPayload } from '@/types/tokenPayload.types';

@injectable()
export class SessionService implements ISessionService  {
    #_sessionRepo : ISessionRepo
    #_snapshotRepo : ISnapshotRepo
    #_redisService : RedisService
    #_kafkaManager : KafkaManager
    #_activeDocs : ActiveDocsMap = new Map();

    constructor(
        @inject(TYPES.ISessionRepo) sessionRepo : ISessionRepo
    ){
      this.#_sessionRepo = sessionRepo
    }

    async createSession(ownerId: string): Promise<ResponseDTO> {
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
    }

    async joinSession(
      socket : Socket,
      io : Server
    ): Promise<void> {
      const { userId, sessionId } = socket.data; 
      socket.join(sessionId);
      await this.#_redisService.addParticipantToSession(sessionId, userId);
      await this.#_redisService.setUserSocketInfo(userId, {
        podName : config.PODNAME,
        socketId : socket.id
      })
      const doc = await this.getOrLoadDoc(sessionId, io);
      const initialState = Y.encodeStateAsUpdate(doc);
      socket.emit('initial-state', { docUpdate : initialState });
    }

    async updateDocument(
      socket : Socket,
      update: YjsUpdate,
      io : Server
    ): Promise<void> {
        const { userId, sessionId } = socket.data;
        const doc = await this.getOrLoadDoc(sessionId, io);
        Y.applyUpdate(doc, update, socket.id);
        this.logOperation({
          eventId: randomUUID(),
          timestamp: new Date().toISOString(),
          sessionId,
          userId,
          operation: Buffer.from(update).toString('base64'),
        }, sessionId);
        socket.broadcast.to(sessionId).emit('doc-update', update);
    }

    async leaveSession(
      socket: Socket,
      io : Server
    ): Promise<void> {
      const { userId, sessionId } = socket.data;
      socket.leave(sessionId);
      await this.#_sessionRepo.removeParticipant(sessionId, userId);
      await this.#_redisService.removeParticipantFromSession(sessionId, userId);
      io.to(sessionId).emit('user-left', { userId })
      const participantCount = await this.#_redisService.getParticipantCount(sessionId);
      if(participantCount === 0){
        const doc = this.#_activeDocs.get(sessionId);
        if (doc) {
            const finalState = Y.encodeStateAsUpdate(doc);
            await this.#_snapshotRepo.saveSnapshot(sessionId, Buffer.from(finalState));
            doc.destroy();
            this.#_activeDocs.delete(sessionId);
        }
      }
    }

    async closeSession(
      socket: Socket,
      io : Server
    ): Promise<void> {
      const { userId, sessionId } = socket.data;
      const session = await this.#_sessionRepo.findSessionById(sessionId);
      if (!session || session.ownerId !== userId) {
        socket.emit('error', { message: 'Only the session owner can close the session.' });
        return;
      }
      const doc = this.#_activeDocs.get(sessionId);
      if (doc) {
        const finalState = Y.encodeStateAsUpdate(doc);
        await this.#_snapshotRepo.saveSnapshot(sessionId, Buffer.from(finalState));
        doc.destroy();
        this.#_activeDocs.delete(sessionId);
      }
      await this.#_sessionRepo.closeSession(sessionId, userId);
      io.in(sessionId).disconnectSockets(true);
    }

  

  private async getOrLoadDoc(sessionId: string, io : Server): Promise<Y.Doc> {
    if (this.#_activeDocs.has(sessionId)) {
      return this.#_activeDocs.get(sessionId)!;
    }

    const doc = new Y.Doc();
    this.#_activeDocs.set(sessionId, doc);

    doc.on('update', (update: YjsUpdate, origin: any) => {
      if (origin!== 'redis') {
        this.#_redisService.publishUpdate(sessionId, update);
      }
    });

    await this.#_redisService.subscribeToUpdates(sessionId, (update: YjsUpdate) => {
      Y.applyUpdate(doc, update, 'redis');
      io.to(sessionId).emit('doc-update', update);
    });

    const snapshot = await this.#_snapshotRepo.getLatestSnapshot(sessionId);
    if (snapshot) {
      Y.applyUpdate(doc, new Uint8Array(snapshot), 'redis');
    }
    return doc;
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
      expiresIn: '1h', // Set expiration to 1 hour
    });
  }
}