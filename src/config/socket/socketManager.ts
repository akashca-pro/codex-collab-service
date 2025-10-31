import { Server, Socket } from 'socket.io';
import { injectable, inject } from 'inversify';
import logger from '@akashcapro/codex-shared-utils/dist/utils/logger';
import { config } from '@/config';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { ISessionService } from '@/services/interfaces/session.service.interface';
import TYPES from '@/config/inversify/types';
import { AccessTokenPayload, InviteTokenPayload } from '@/types/tokenPayload.types';
import { parseCookies } from '@/utils/cookieParser';
import { ActiveSessionMetadata } from '@/types/document.types';


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
    const inviteToken = socket.handshake.auth.token;
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const accessToken = cookies['accessToken'];
    if (!inviteToken || !accessToken) {
      return next(new Error("401"));
    }
    try {
      const decodedInviteId = jwt.verify(inviteToken, config.JWT_INVITE_TOKEN_SECRET) as InviteTokenPayload;
      const decodedAccessToken = jwt.verify(accessToken, config.JWT_ACCESS_TOKEN_SECRET) as AccessTokenPayload;
      if (!decodedInviteId.sessionId) {
        return next(new Error('Authentication error: Invalid token payload.'));
      }
      socket.data.sessionId = decodedInviteId.sessionId;
      socket.data.ownerId = decodedInviteId.ownerId;
      socket.data.userId = decodedAccessToken.userId;
      socket.data.email = decodedAccessToken.email;
      next();
    } catch (error) {
      logger.error('JWT invite token verification failed', error);
      next(new Error('Authentication error: Invalid or expired token.'));
    }
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const { ownerId, sessionId } = socket.data;
    logger.info(`User with ownerId ${ownerId} authenticated for session ${sessionId} with socket ID: ${socket.id}`);

    // Always invoke joinSession on new connection/reconnection; it is idempotent and ensures initial-state
    await this.#_sessionService.joinSession(socket, this.#_io);
    socket.on('doc-update', async (update : any) => {
      const docUpdate = update instanceof Uint8Array 
        ? update 
        : new Uint8Array(Buffer.isBuffer(update) ? update : Buffer.from(update));
      await this.#_sessionService.updateDocument(socket, docUpdate, this.#_io);
    })

    socket.on('awareness-update', async (update : any) => {
      const awarenessUpdate = update instanceof Uint8Array 
        ? update 
        : new Uint8Array(Buffer.isBuffer(update) ? update : Buffer.from(update));
      await this.#_sessionService.handleAwarenessUpdate(socket, awarenessUpdate);
    })

    socket.on('metadata-changed', async (update : ActiveSessionMetadata) => {
      await this.#_sessionService.changeLanguage(socket, this.#_io, update.language)
    })

    socket.on('leave-session', async () => {
      await this.#_sessionService.leaveSession(socket);
    })

    socket.on('close-session', async () => {
      await this.#_sessionService.closeSession(socket, this.#_io);
    })

    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${ownerId}`);
      await this.#_sessionService.leaveSession(socket);
    });
  }
}