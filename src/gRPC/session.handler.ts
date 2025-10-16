import TYPES from "@/config/inversify/types";
import { ISessionService } from "@/services/interfaces/session.service.interface";
import { withGrpcErrorHandler } from "@/utils/errorHandler";
import { inject, injectable } from "inversify";


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


}