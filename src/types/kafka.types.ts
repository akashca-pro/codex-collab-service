/**
 * Represents a single CRDT update operation logged to Kafka.
 * This provides a durable, append-only log for auditing and recovery.
 */
export interface CollaborationOpLog {
  eventId: string; // A unique identifier for the event (e.g., UUID)
  timestamp: string; // ISO 8601 timestamp of when the operation was received
  sessionId: string; // The ID of the collaboration session
  userId: string; // The ID of the user who performed the operation
  operation: string; // The Base64 encoded binary Yjs update data (Uint8Array)
}