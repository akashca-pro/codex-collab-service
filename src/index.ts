import http from 'http'
import express from "express";
import { Server } from "socket.io";
import container from "./config/inversify/container";
import TYPES from "./config/inversify/types";
import { SocketManager } from "./config/socket/socketManager";
import { startGrpcServer } from "./gRPC/server";
import cookieParser from 'cookie-parser';
import logger from "./utils/pinoLogger";
import { connectDB } from "./config/db";
import { config } from "./config";
import { ISessionRepo } from './db/repos/interfaces/session.repo.interface';

const app = express();
const corsOptions = {
  origin: [config.CLIENT_URL_1, config.CLIENT_URL_2],
  credentials: true,
  methods : ['GET','POST']
};

app.use(cookieParser());
const server = http.createServer(app);
const io = new Server(server,{
    cors : corsOptions,
    maxHttpBufferSize: 1e8, // 100 MB max buffer
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket'],
    allowUpgrades: true,
    perMessageDeflate: false,
    httpCompression: false, 
});

const socketManager = container.get<SocketManager>(TYPES.SocketManager);
const sessionRepo = container.get<ISessionRepo>(TYPES.ISessionRepo);

const startServer = async () => {
    try {
        connectDB()
        logger.info('Initializing socket manager...')
        await socketManager.init(io);
        logger.info('Socket manager initilized successfully');

        startGrpcServer()
        const PORT = config.SOCKET_PORT
        server.listen(PORT, () => {
            logger.info(`HTTP/Socket.IO server listening on port ${PORT}`);
        });

        // Periodic job: mark expired sessions as ENDED
        const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
        setInterval(async () => {
            try {
                const modified = await sessionRepo.markExpiredSessionsEnded(new Date());
                if (modified > 0) {
                    logger.info(`Marked ${modified} sessions as ENDED due to expiry.`);
                }
            } catch (err) {
                logger.error('Failed to mark expired sessions as ENDED', err);
            }
        }, INTERVAL_MS);
    } catch (error) {
        logger.error('Failed to start server : ',error);
        process.exit(1);
    }
};

startServer();