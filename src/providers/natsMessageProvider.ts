import { JsMsg } from "nats";
import { IMessageProvider } from "./interfaces/IMessageProvider.interface";
import { natsManager } from "@/config/nats";

export class NatsMessageProvider implements IMessageProvider {
    public async connect(): Promise<void> {
        return natsManager.connect();
    }

    public publish<T>(subject: string, payload: T): void {
        natsManager.publish(subject, payload);
    }

    public subscribe<T>(subject: string, callback: (data: T) => void): void {
        natsManager.subscribe(subject, callback);
    }

    public async publishToStream<T>(subject: string, streamName: string, payload: T): Promise<void> {
        await natsManager.publishToStream<T>(subject,streamName,payload);
    }

    public async subscribeToStream<T>(
        subject: string, 
        streamName: string, 
        durableName: string, 
        callback: (decoded: T, rawMsg : JsMsg) => Promise<void>
    ): Promise<void> {
        await natsManager.subscribeToStream<T>(subject, streamName, durableName, callback);
    }
}
