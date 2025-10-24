import { UserSocketInfo } from '../types/redis.types'; // Assuming types are in a 'types.ts' file
import { YjsUpdate } from '@/types/client-server.types'
import redis from '@/config/redis/index';
import { ActiveSessionMetadata } from '@/types/document.types';
import { injectable } from 'inversify';
import Redis from 'ioredis';

@injectable()
export class RedisService {
  #_publisher: Redis;
  #_subscriber: Redis;
  #_delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  constructor() {
    this.#_publisher = redis
    this.#_subscriber = this.#_publisher.duplicate();
  }

  public async connect(): Promise<void> {
    await Promise.all([this.#_publisher.connect(), this.#_subscriber.connect()]);
    console.log('Connected to Redis clients.');
  }

  public async setUserSocketInfo(userId: string, info: UserSocketInfo): Promise<void> {
    const key = `user:socket:${userId}`;
    await this.#_publisher.hset(key, info);
  }

  public async getUserSocketInfo(userId: string): Promise<UserSocketInfo | null> {
    const key = `user:socket:${userId}`;
    const result = await this.#_publisher.hgetall(key);
    return result? (result as unknown as UserSocketInfo) : null;
  }

  public async addParticipantToSession(sessionId: string, userId: string): Promise<void> {
    await this.#_publisher.sadd(`session:participants:${sessionId}`, userId);
  }

  public async removeParticipantFromSession(sessionId: string, userId: string): Promise<void> {
    await this.#_publisher.srem(`session:participants:${sessionId}`, userId);
  }

  public async getParticipantCount(sessionId: string): Promise<number> {
    const key = `session:participants:${sessionId}`;
    return this.#_publisher.scard(key);
  }

  public async publishDocUpdate(sessionId: string, update: YjsUpdate): Promise<void> {
    const channel = `session:doc-updates:${sessionId}`;
    await this.publishWithRetry(channel, Buffer.from(update));
  }

  public async subscribeToDocUpdates(
    sessionId: string,
    callback: (update: YjsUpdate) => void
  ): Promise<void> {
    const channel = `session:doc-updates:${sessionId}`;
    this.#_subscriber.subscribe(channel);
    this.#_subscriber.on('message', (_channel, message) => {
        if (_channel === channel && message) {
            callback(new Uint8Array(Buffer.from(message, 'binary')));
        }
    });
  }

  public async publishAwarenessUpdate(sessionId: string, update: YjsUpdate): Promise<void> {
    const channel = `session:awareness-updates:${sessionId}`;
    await this.publishWithRetry(channel, Buffer.from(update));
  }

  public async subscribeToAwarenessUpdates(
    sessionId: string,
    callback: (update: YjsUpdate) => void
  ): Promise<void> {
    const channel = `session:awareness-updates:${sessionId}`;
    this.#_subscriber.subscribe(channel);
    this.#_subscriber.on('message', (_channel, message) => {
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
    await this.publishWithRetry(channel, JSON.stringify(metadata));
  }

  public async subscribeToMetadataUpdates(
    sessionId: string,
    callback: (metadata: ActiveSessionMetadata) => void
  ): Promise<void> {
    const channel = `session:metadata-updates:${sessionId}`;
    this.#_subscriber.subscribe(channel);
    this.#_subscriber.on('message', (_channel, message) => {
      if (_channel === channel && message) {
        // Parse the JSON string back into an object
        const metadata = JSON.parse(message) as ActiveSessionMetadata;
        callback(metadata);
      }
    });
  }

  private async publishWithRetry(channel: string, message: string | Buffer, retries = 3): Promise<void> {
      for (let i = 0; i < retries; i++) {
        try {
          await this.#_publisher.publish(channel, message);
          return; // Success, exit the loop
        } catch (error) {
          console.error(`Redis publish to channel ${channel} failed. Attempt ${i + 1}/${retries}.`, error);
          if (i === retries - 1) {
            // If this was the last attempt, re-throw the error
            throw error;
          }
          await this.#_delay(50 * Math.pow(2, i));
        }
      }
    }
}
