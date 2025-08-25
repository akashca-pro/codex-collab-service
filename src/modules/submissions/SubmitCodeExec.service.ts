import TYPES from "@/config/inversify/types";
import { NatsSubjects } from "@/config/nats/natsSubjects";
import { ISocketManager } from "@/config/socket/socketManager.interface";
import { IMessageProvider } from "@/providers/interfaces/IMessageProvider.interface";
import logger from "@akashcapro/codex-shared-utils/dist/utils/logger";
import { ExecutionResult } from '@akashcapro/codex-shared-utils/dist/proto/compiled/gateway/problem'
import { inject, injectable } from "inversify";

interface ISubmissionResult {
    problemId : string;
    submissionId : string;
    userId : string;
    executionResult : ExecutionResult
    executionTime : number | null;
    memoryUsage : number | null;
    status : string;
    score : number;
}

/**
 * Class responsible for listening to the nats for submission results and handle the result.
 * 
 * @class
 */
@injectable()
export class SubmitCodeExecService {

    #_messageProvider : IMessageProvider
    #_socketManager : ISocketManager

    constructor(
        @inject(TYPES.IMessageProvider)
        messageProvider : IMessageProvider,

        @inject(TYPES.ISocketManager)
        socketManager : ISocketManager
    ){
        this.#_messageProvider = messageProvider;
        this.#_socketManager = socketManager
    }

    /**
     * Starts listening for the submission result from the NATS.
     */
    public listen(): void {
        const subject = NatsSubjects.SUBMISSION_RESULT

        this.#_messageProvider.subscribe<ISubmissionResult>(subject, (result) => {
            this.handleResult(result);
        })
    }

    /**
     * Handles an incoming result from NATS
     * 
     * @param result - The submission result payload from nats
     */
    private handleResult(result : ISubmissionResult) : void {
        logger.info(`Received result for submission: ${result.submissionId}`);

        this.#_socketManager.emitToUser(result.userId, 'submission:updated', result);
    }
}