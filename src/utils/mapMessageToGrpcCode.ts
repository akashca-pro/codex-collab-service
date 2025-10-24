import { SESSION_ERROR_MESSAGES } from "@/const/errorType.const"
import { status } from "@grpc/grpc-js";

/**
 * Maps a known domain message to a gRPC status code.
 * 
 * @param {string} message - The domain message from enum.
 * @returns {status} gRPC status code
 */
export const mapMessageToGrpcStatus = (message : string) : status => {
    switch(true){

        case message === SESSION_ERROR_MESSAGES.SESSION_ALREADY_EXIST:
            return status.ALREADY_EXISTS

        default:
            return status.UNKNOWN
    }
}