import { UserSocketInfo } from '../types/redis.types'; // Assuming types are in a 'types.ts' file
import redis from '@/config/redis/index';
import { injectable } from 'inversify';
import Redis from 'ioredis';
import logger from '@/utils/pinoLogger';
import { EventEmitter } from 'events';

@injectable()
export class RedisService extends EventEmitter{
  #_publisher: Redis;
  #_subscriber: Redis;
  #_delay = (ms: number) => new Promise(res => setTimeout(res, ms));
  #_sessionSubscriptions: Map<string, (channel: string, message: Buffer) => void> = new Map();

  constructor() {
    super();
    this.#_publisher = redis
    this.#_subscriber = this.#_publisher.duplicate(); 
  }

  public async connect(): Promise<void> {
    await Promise.all([this.#_publisher.connect(), this.#_subscriber.connect()]);

    this.#_subscriber.on('messageBuffer', (channelBuffer, messageBuffer) => {
      const channel = channelBuffer.toString();
      this.emit('redis-message', channel, messageBuffer);
    });

    logger.info('Connected to Redis clients.');
  }

  /**
   * Publish a binary update to a specific channel
   */
  public async publishUpdate(channel: string, update: Uint8Array): Promise<void> {
    await this.#_publisher.publish(channel, Buffer.from(update));
  }

  /**
   * Subscribe to updates for a specific session
   */
  public async subscribeToSession(
    sessionId: string, 
    onUpdate: (type: 'doc' | 'awareness', data: Uint8Array) => void
  ): Promise<void> {
    const docChannel = `session:${sessionId}:doc`;
    const awarenessChannel = `session:${sessionId}:awareness`;

    // Avoid double subscription
    if (this.#_sessionSubscriptions.has(sessionId)) return;

    // Handler to route messages to the specific session callback
    const listener = (channel: string, message: Buffer) => {
      if (channel === docChannel) {
        onUpdate('doc', message);
      } else if (channel === awarenessChannel) {
        onUpdate('awareness', message);
      }
    };

    // Store listener so we can unsubscribe later if needed (though tricky with global emitter)
    this.#_sessionSubscriptions.set(sessionId, listener);

    // Register generic listener filter
    this.on('redis-message', listener);

    // Actually subscribe in Redis
    await this.#_subscriber.subscribe(docChannel, awarenessChannel);
    logger.debug(`Subscribed to Redis channels for session ${sessionId}`);
  }

  public async unsubscribeFromSession(sessionId: string): Promise<void> {
      const docChannel = `session:${sessionId}:doc`;
      const awarenessChannel = `session:${sessionId}:awareness`;
      
      await this.#_subscriber.unsubscribe(docChannel, awarenessChannel);
      
      const listener = this.#_sessionSubscriptions.get(sessionId);
      if (listener) {
        this.off('redis-message', listener);
        this.#_sessionSubscriptions.delete(sessionId);
      }
  }

  public async publishControlMessage(sessionId: string, message: { type: 'DESTROY' }): Promise<void> {
      const channel = `session:${sessionId}:control`;
      await this.#_publisher.publish(channel, JSON.stringify(message));
  }

  public async subscribeToControl(
      sessionId: string, 
      callback: (message: { type: 'DESTROY' }) => void
  ): Promise<void> {
      const channel = `session:${sessionId}:control`;
      await this.#_subscriber.subscribe(channel);
      
      // We reuse the existing event emitter logic or add a specific one
      this.#_subscriber.on('message', (chan, msg) => {
          if (chan === channel) {
              const parsed = JSON.parse(msg);
              callback(parsed);
          }
      });
  }

  public async unsubscribeFromControl(sessionId: string): Promise<void> {
      const channel = `session:${sessionId}:control`;
      await this.#_subscriber.unsubscribe(channel);
  }

  public async saveSnapshot(sessionId: string, snapshot: Uint8Array, ttlSeconds: number = 86400): Promise<void> {
      const key = `session:snapshot:${sessionId}`;
      await this.#_publisher.set(key, Buffer.from(snapshot), 'EX', ttlSeconds);
  }

  public async getSnapshot(sessionId: string): Promise<Uint8Array | null> {
      const key = `session:snapshot:${sessionId}`;
      const result = await this.#_publisher.getBuffer(key); 
      return result ? new Uint8Array(result) : null;
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
}
