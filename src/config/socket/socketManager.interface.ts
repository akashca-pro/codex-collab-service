import { Server } from "socket.io";

export interface ISocketManager {
  /**
   * Initialize the Socket.IO server connection handling.
   * Typically called once during application startup.
   * 
   * @param io - An initialized Socket.IO server instance
   */
  init(io: Server): void;

  /**
   * Emit a socket.io event to a specific connected user.
   * 
   * @param userId - Unique user identifier
   * @param event  - Event name to send
   * @param data   - Payload to send with the event
   */
  emitToUser<T>(userId: string, event: string, data: T): Promise<void>;
}
