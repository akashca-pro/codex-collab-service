import http from "http";
import express from "express";
import { createSocketServer } from "@/config/socket";
import { config } from "./config";
import logger from "@akashcapro/codex-shared-utils/dist/utils/logger";
import container from "./config/inversify/container";
import TYPES from "./config/inversify/types";
import { ISocketManager } from "./config/socket/socketManager.interface";
import { SubmitCodeExecService } from "./modules/submissions/SubmitCodeExec.service";
import { IMessageProvider } from "./providers/interfaces/IMessageProvider.interface";

const app = express();
const server = http.createServer(app);
const io = createSocketServer(server);

const messageProvider = container.get<IMessageProvider>(TYPES.IMessageProvider);
const socketManager = container.get<ISocketManager>(TYPES.ISocketManager);

const submitCodeExecService = container.get<SubmitCodeExecService>(TYPES.SubmitCodeExecService);

socketManager.init(io);

const startServer = async () => {
    try {

        await messageProvider.connect();
        submitCodeExecService.listen();

        server.listen(config.WSS_PORT,()=>{
            logger.info(`${config.SERVICE_NAME} running on port ${config.WSS_PORT}`);
        });

    } catch (error) {
        logger.error('Failed to start server : ',error);
        process.exit(1);
    }
};

startServer();