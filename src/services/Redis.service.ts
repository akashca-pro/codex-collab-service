import { UserSocketInfo } from '../types/redis.types'; // Assuming types are in a 'types.ts' file
import { YjsUpdate } from '@/types/client-server.types'
import Redis from 'ioredis';

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

  /**
   * Stores the socket and pod information for a given user.
   */
  public async setUserSocketInfo(userId: string, info: UserSocketInfo): Promise<void> {
    const key = `user:socket:${userId}`;
    await this.publisher.hset(key, info);
  }

  /**
   * Retrieves the socket and pod information for a user.
   */
  public async getUserSocketInfo(userId: string): Promise<UserSocketInfo | null> {
    const key = `user:socket:${userId}`;
    const result = await this.publisher.hgetall(key);
    return result? (result as unknown as UserSocketInfo) : null;
  }

  /**
   * Adds a user to a session's participant set.
   */
  public async addParticipantToSession(sessionId: string, userId: string): Promise<void> {
    await this.publisher.sadd(`session:participants:${sessionId}`, userId);
  }

  /**
   * Removes a user from a session's participant set.
   */
  public async removeParticipantFromSession(sessionId: string, userId: string): Promise<void> {
    await this.publisher.srem(`session:participants:${sessionId}`, userId);
  }

  /**
   * Gets the total number of participants in a session across all pods.
   */
  public async getParticipantCount(sessionId: string): Promise<number> {
    const key = `session:participants:${sessionId}`;
    return this.publisher.scard(key);
  }

  /**
   * Publishes a document update to a session-specific channel.
   * This is the core of horizontal scaling for real-time updates.
   */
  public async publishUpdate(sessionId: string, update: YjsUpdate): Promise<void> {
    const channel = `session:updates:${sessionId}`;
    // Redis pub/sub works with strings or buffers, so convert the Uint8Array
    await this.publisher.publish(channel, Buffer.from(update));
  }

  /**
   * Subscribes to a session's update channel and executes a callback on new messages.
   */
  public async subscribeToUpdates(
    sessionId: string,
    callback: (update: YjsUpdate) => void
  ): Promise<void> {
    const channel = `session:updates:${sessionId}`;
    this.subscriber.on('message', (_channel, message) => {
        if (_channel !== channel) {
            return;
        }
        if (message) {
            callback(new Uint8Array(Buffer.from(message, 'binary')));
        }
    });
    await this.subscriber.subscribe(channel);
  }
}
