import { Server, Socket } from 'socket.io'
import { injectable } from 'inversify'
import logger from '@akashcapro/codex-shared-utils/dist/utils/logger';
import { config } from '@/config';
import { ISocketManager } from './socketManager.interface';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

/**
 * Class responsible for managing all socket.io connections and emit events to user.
 * 
 * @class
 */
@injectable()
export class SocketManager implements ISocketManager {

    #_io : Server;

    constructor(){}

    public async init(io : Server) : Promise<void> {
        this.#_io = io;

        // Redis adapter setup for cross-node room syncing.
        const pubClient = createClient({ url : config.REDIS_URL });
        const subClient = pubClient.duplicate();
        await Promise.all([
            pubClient.connect(),
            subClient.connect()
        ])

        this.#_io.adapter(createAdapter(pubClient,subClient));

        // initial connection handling.
        this.#_io.on('connection',(socket : Socket)=>{
            this.handleConnection(socket);
        })
    }

    private async handleConnection(socket : Socket) : Promise<void> {

        const userId = socket.data.user.Id;
        logger.info(`User connected: ${userId} with socket ID: ${socket.id}`);

        await socket.join(userId);

        socket.on('disconnect',()=>{
            logger.info(`User disconnected: ${userId}`);
        });
    }

    public async emitToUser<T>(
        userId : string,
        event : string,
        data : T
    ) : Promise<void>{
        try {

          this.#_io.to(userId).emit(event,data);  

        } catch (error) {
            logger.warn(`Error emitting event to user ${userId}:`,error);
        }
    }
}