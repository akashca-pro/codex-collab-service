import TYPES from "@/config/inversify/types";
import { ISessionService } from "@/services/interfaces/session.service.interface";
import { withGrpcErrorHandler } from "@/utils/errorHandler";
import { inject, injectable } from "inversify";
import { CreateSessionRequest, CreateSessionResponse }
from "@akashcapro/codex-shared-utils/dist/proto/compiled/gateway/collab";
import logger from "@/utils/pinoLogger";
import { mapMessageToGrpcStatus } from "@/utils/mapMessageToGrpcCode";
import { UntypedServiceImplementation } from "@grpc/grpc-js";

/**
 * Class responsible for handling session-related gRPC requests.
 * 
 * @class
 */
@injectable()
export class SessionHandler {

    #_sessionService : ISessionService

    constructor(
        @inject(TYPES.ISessionService) sessionService : ISessionService
    ){
        this.#_sessionService = sessionService
    }

    createSession = withGrpcErrorHandler<CreateSessionRequest, CreateSessionResponse>(
        async (call, callback) => {
            const method = 'createSession';
            logger.info(`[gRPC] ${method} started`,{ownerId : call.request.ownerId})
            const result = await this.#_sessionService.createSession(call.request.ownerId);
            if(!result.success){
                logger.warn(`[gRPC] ${method} failed: ${result.errorMessage}`);
                callback({
                    code : mapMessageToGrpcStatus(result.errorMessage!),
                    message : result.errorMessage
                });
            }
            logger.info(`[gRPC] ${method} completed successfully`, { inviteToken : result.data.inviteToken })
            return callback(null, result.data);
        }
    )

    getServiceHandlers() : UntypedServiceImplementation {
        return {
            createSession : this.createSession
        }
    }
}