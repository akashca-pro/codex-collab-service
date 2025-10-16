import { Language } from '@/const/language.const';
import { UserSocketInfo } from '../types/redis.types'; // Assuming types are in a 'types.ts' file
import { YjsUpdate } from '@/types/client-server.types'
import Redis from 'ioredis';
import { ActiveSessionMetadata } from '@/types/document.types';

export class RedisService {
  private publisher: Redis;
  private subscriber: Redis;

  constructor(redis : Redis) {
    this.publisher = redis
    this.subscriber = this.publisher.duplicate();
  }

  public async connect(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    console.log('Connected to Redis clients.');
  }

  public async setUserSocketInfo(userId: string, info: UserSocketInfo): Promise<void> {
    const key = `user:socket:${userId}`;
    await this.publisher.hset(key, info);
  }

  public async getUserSocketInfo(userId: string): Promise<UserSocketInfo | null> {
    const key = `user:socket:${userId}`;
    const result = await this.publisher.hgetall(key);
    return result? (result as unknown as UserSocketInfo) : null;
  }

  public async addParticipantToSession(sessionId: string, userId: string): Promise<void> {
    await this.publisher.sadd(`session:participants:${sessionId}`, userId);
  }

  public async removeParticipantFromSession(sessionId: string, userId: string): Promise<void> {
    await this.publisher.srem(`session:participants:${sessionId}`, userId);
  }

  public async getParticipantCount(sessionId: string): Promise<number> {
    const key = `session:participants:${sessionId}`;
    return this.publisher.scard(key);
  }

  public async publishDocUpdate(sessionId: string, update: YjsUpdate): Promise<void> {
    const channel = `session:doc-updates:${sessionId}`;
    await this.publisher.publish(channel, Buffer.from(update));
  }

  public async subscribeToDocUpdates(
    sessionId: string,
    callback: (update: YjsUpdate) => void
  ): Promise<void> {
    const channel = `session:doc-updates:${sessionId}`;
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', (_channel, message) => {
        if (_channel === channel && message) {
            callback(new Uint8Array(Buffer.from(message, 'binary')));
        }
    });
  }

  public async publishAwarenessUpdate(sessionId: string, update: YjsUpdate): Promise<void> {
    const channel = `session:awareness-updates:${sessionId}`;
    await this.publisher.publish(channel, Buffer.from(update));
  }

  public async subscribeToAwarenessUpdates(
    sessionId: string,
    callback: (update: YjsUpdate) => void
  ): Promise<void> {
    const channel = `session:awareness-updates:${sessionId}`;
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', (_channel, message) => {
        if (_channel === channel && message) {
            callback(new Uint8Array(Buffer.from(message, 'binary')));
        }
    });
  }

  public async publishMetadataUpdate(
    sessionId: string,
    metadata: ActiveSessionMetadata
  ): Promise<void> {
    const channel = `session:metadata-updates:${sessionId}`;
    await this.publisher.publish(channel, JSON.stringify(metadata));
  }

  public async subscribeToMetadataUpdates(
    sessionId: string,
    callback: (metadata: ActiveSessionMetadata) => void
  ): Promise<void> {
    const channel = `session:metadata-updates:${sessionId}`;
    this.subscriber.subscribe(channel);
    this.subscriber.on('message', (_channel, message) => {
      if (_channel === channel && message) {
        // Parse the JSON string back into an object
        const metadata = JSON.parse(message) as ActiveSessionMetadata;
        callback(metadata);
      }
    });
  }
}
