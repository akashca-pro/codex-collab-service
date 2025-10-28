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
    // Binary data handling
    maxHttpBufferSize: 1e8, // 100 MB max buffer
    // Connection settings
    pingTimeout: 60000,
    pingInterval: 25000,
    // Use websocket with proper upgrade
    transports: ['websocket'],
    // Allow upgrades
    allowUpgrades: true,
    // Ensure proper protocol handling
    perMessageDeflate: false, // IMPORTANT: Disable compression for binary data
    httpCompression: false,   // IMPORTANT: Disable HTTP compression
});

const socketManager = container.get<SocketManager>(TYPES.SocketManager);
const kafkaManager = container.get<KafkaManager>(TYPES.KafkaManager);

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
    } catch (error) {
        logger.error('Failed to start server : ',error);
        process.exit(1);
    }
};

startServer();