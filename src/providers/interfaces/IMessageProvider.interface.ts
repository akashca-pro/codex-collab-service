import { JsMsg } from "nats";

/**
 * Interface defines the contract for any messaging service
 * 
 * @interface
 */
export interface IMessageProvider {

    connect(): Promise<void>;

    publish<T>(
        subject: string, 
        payload: T
    ): void;

    subscribe<T>(
        subject: string, 
        callback: (data: T) => void
    ): void;

    publishToStream<T>(
        subject : string,
        streamName : string,
        payload : T
    ) : Promise<void>

    subscribeToStream<T>(
        subject : string,
        streamName : string,
        durableName : string,
        callback: (decoded: T, rawMsg : JsMsg) => Promise<void>
    ) : Promise<void>
}