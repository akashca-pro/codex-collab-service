import { SYSTEM_ERROR_MESSAGES } from "@/const/errorType.const"
import logger from '@/utils/pinoLogger';
import { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { Status } from '@grpc/grpc-js/build/src/constants';

type GrpcHandler<Req, Res> = (
    call : ServerUnaryCall<Req, Res>,
    callback : sendUnaryData<Res>
) => Promise<void>;

export function withGrpcErrorHandler<Req, Res>(
    handler : GrpcHandler<Req, Res>
) : GrpcHandler<Req, Res> {
    return async (call , callback) => {
        try {
            await handler(call, callback);
        } catch (error) {
            logger.error(SYSTEM_ERROR_MESSAGES.INTERNAL_SERVER_ERROR, error);
            if (error instanceof GrpcError) {
                return callback({ code: error.code, message: error.message }, null);
            }
            callback({
                code : Status.INTERNAL,
                message : SYSTEM_ERROR_MESSAGES.INTERNAL_SERVER_ERROR
            },null)
        }
    }
}

export class GrpcError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}