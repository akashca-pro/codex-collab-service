import https from 'https';
import fs from 'fs';
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
import { KafkaManager } from './config/kafka/kafkaManager';
import { KafkaTopics } from './config/kafka/kafkaTopic';
import { ISessionRepo } from './db/repos/interfaces/session.repo.interface';

// const privateKey = fs.readFileSync('/app/localhost+1-key.pem', 'utf8');
// const certificate = fs.readFileSync('/app/localhost+1.pem', 'utf8');
const privateKey = fs.readFileSync('../../localhost+1-key.pem', 'utf8');
const certificate = fs.readFileSync('../../localhost+1.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const app = express();
const corsOptions = {
  origin: config.CLIENT_URL,
  credentials: true,
  methods : ['GET','POST']
};
// app.use(cors(corsOptions));
app.use(cookieParser());
const server = https.createServer(credentials, app);
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
const kafkaManager = container.get<KafkaManager>(TYPES.KafkaManager);
const sessionRepo = container.get<ISessionRepo>(TYPES.ISessionRepo);

const startServer = async () => {
    try {
        connectDB()
        // // kafka core setup
        // logger.info('Initializing Kafka Manager...');
        // await kafkaManager.init();
        // logger.info('Kafka Manager initialized successfully.');

        // // // create topics
        // logger.info('Creating necessary Kafka topics...');
        // const topicsToCreate = [
        //     KafkaTopics.COLLABORATION_OPS_LOG,
        // ]

        // for (const topic of topicsToCreate) {
        //     await kafkaManager.createTopic(topic);
        //     logger.debug(`Kafka topic created: ${topic}`);
        // }
        // logger.info('All necessary Kafka topics created.');

        logger.info('Initializing socket manager...')
        await socketManager.init(io);
        logger.info('Socket manager initilized successfully');

        startGrpcServer()
        const PORT = config.SOCKET_PORT
        server.listen(PORT, () => {
            logger.info(`HTTPS/Socket.IO server listening on port ${PORT}`);
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