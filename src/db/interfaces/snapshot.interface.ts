import { Document, Types } from "mongoose";

/**
 * Represents the schema for the 'document_snapshots' collection in MongoDB.
 * Stores the complete state of a document at a specific point in time.
 */
export interface ISnapshot extends Document {
  sessionId: Types.ObjectId;
  version: number; // Monotonically increasing version number for a given session
  snapshot: Buffer; // BSON binary data of Y.encodeStateAsUpdate(doc)
  createdAt: Date;
}