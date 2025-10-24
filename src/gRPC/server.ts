import { Server, ServerCredentials } from "@grpc/grpc-js";
import { SessionManagerService } from '@akashcapro/codex-shared-utils/dist/proto/compiled/gateway/collab'
import container from "@/config/inversify/container";
import { SessionHandler } from "./session.handler";
import TYPES from "@/config/inversify/types";
import { config } from "@/config";
import logger from "@/utils/pinoLogger";
const sessionHandlers = container.get<SessionHandler>(TYPES.SessionHandler);
export const startGrpcServer = () => {
    const server = new Server();
    server.addService(
        SessionManagerService, sessionHandlers.getServiceHandlers(),
    )
    server.bindAsync(
        config.GRPC_COLLAB_SERVICE_URL,
        ServerCredentials.createInsecure(),
        (err,port) => {
            if(err){
                logger.error('gRPC Server failed to start : ', err);
            }
            logger.info(`gRPC Server running on port ${port}`);
        }
    )
}