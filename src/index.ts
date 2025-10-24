import http from "http";
import express from "express";
import { createSocketServer } from "@/config/socket";
import container from "./config/inversify/container";
import TYPES from "./config/inversify/types";
import { SocketManager } from "./config/socket/socketManager";
import { startGrpcServer } from "./gRPC/server";
import logger from "./utils/pinoLogger";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);

const socketManager = container.get<SocketManager>(TYPES.SocketManager);

const startServer = async () => {
    try {
        await socketManager.init(io);
        startGrpcServer()
        const PORT = 5001
        server.listen(PORT, () => {
            logger.info(`HTTP/Socket.IO server listening on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server : ',error);
        process.exit(1);
    }
};

startServer();