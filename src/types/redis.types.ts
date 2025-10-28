/**
 * Defines the structure for mapping a user's ID to their active
 * WebSocket connection details. This is crucial for targeted messaging
 * and for managing presence across a horizontally scaled system.
 *
 * @key `user:socket:{userId}`
 * @type Hash
 */
export interface UserSocketInfo {
  socketId: string; // The unique ID of the socket connection
  podName: string;  // The name of the Kubernetes pod handling the connection
}

/**
 * A simple set of user IDs for a given session. Used to quickly
 * check who is participating in a session.
 *
 * @key `session:participants:{sessionId}`
 * @type Set
 */
export type SessionParticipants = Set<string>;