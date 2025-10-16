// src/types/db.types.ts
import { Status } from '@/const/status.const';
import { ObjectId } from 'mongodb';

/**
 * Represents the schema for the 'sessions' collection in MongoDB.
 * Stores metadata about each collaboration session.
 */
export interface SessionDocument {
  _id: ObjectId; 
  documentId: string; // Reference to the original document/problem in the main application
  ownerId: string; // The user ID of the session creator
  participants: string; // Array of user IDs currently in the session
  createdAt: Date;
  endedAt?: Date; // Null until the session is terminated
  status: Status
}

/**
 * Represents the schema for the 'document_snapshots' collection in MongoDB.
 * Stores the complete state of a document at a specific point in time.
 */
export interface DocumentSnapshot {
  _id: ObjectId;
  sessionId: ObjectId; // Foreign key reference to the 'sessions' collection
  version: number; // Monotonically increasing version number for a given session
  snapshot: Buffer; // BSON binary data of Y.encodeStateAsUpdate(doc)
  createdAt: Date;
}