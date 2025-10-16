// src/config/socket/socketManager.ts
import { Server, Socket } from 'socket.io';
import { injectable, inject } from 'inversify';
import logger from '@akashcapro/codex-shared-utils/dist/utils/logger';
import { config } from '@/config';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { ISessionService } from '@/services/interfaces/session.service.interface';
import TYPES from '@/config/inversify/types';
import { YjsUpdate } from '@/types/client-server.types';
import { InviteTokenPayload } from '@/types/tokenPayload.types';


@injectable()
export class SocketManager {
    #_io: Server;
    #_sessionService : ISessionService

  constructor(
    @inject(TYPES.ISessionService) sessionService : ISessionService
  ) {
    this.#_sessionService = sessionService
  }

  public async init(io: Server): Promise<void> {
    this.#_io = io;

    const pubClient = createClient({ url: config.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.#_io.adapter(createAdapter(pubClient, subClient));

    this.#_io.use(this.authMiddleware.bind(this));

    this.#_io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Middleware to verify the invite token for every new connection.
   */
  private authMiddleware(socket: Socket, next: (err?: Error) => void): void {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided.'));
    }
    try {
      const decoded = jwt.verify(token, config.JWT_ACCESS_TOKEN_SECRET) as InviteTokenPayload;
      if (!decoded.sessionId) {
        return next(new Error('Authentication error: Invalid token payload.'));
      }
      socket.data.sessionId = decoded.sessionId;
      next(); // Success
    } catch (error) {
      logger.error('JWT invite token verification failed', error);
      next(new Error('Authentication error: Invalid or expired token.'));
    }
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const { userId, sessionId } = socket.data;
    logger.info(`User ${userId} authenticated for session ${sessionId} with socket ID: ${socket.id}`);

    const roomSockets = await this.#_io.in(sessionId).fetchSockets();
    const alreadyJoined = roomSockets.find(r=>r.id === socket.id)
    if(!alreadyJoined){
        await this.#_sessionService.joinSession(socket, this.#_io);
    }

    socket.on('doc-update',async (update: YjsUpdate) => {
        await this.#_sessionService.updateDocument(socket, update, this.#_io);
    });

    socket.on('end-session',async ()=>{
        await this.#_sessionService.closeSession(socket, this.#_io);
    })

    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${userId}`);
      await this.#_sessionService.leaveSession(socket, this.#_io);
    });
  }
}