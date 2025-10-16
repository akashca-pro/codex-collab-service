import http from "http";
import express from "express";
import { createSocketServer } from "@/config/socket";
import { config } from "./config";
import logger from "@akashcapro/codex-shared-utils/dist/utils/logger";
import container from "./config/inversify/container";
import TYPES from "./config/inversify/types";
import { SocketManager } from "./config/socket/socketManager";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);

const socketManager = container.get<SocketManager>(TYPES.SocketManager);


const startServer = async () => {
    try {
        await socketManager.init(io);

    } catch (error) {
        logger.error('Failed to start server : ',error);
        process.exit(1);
    }
};

startServer();