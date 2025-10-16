import mongoose, { Schema } from "mongoose";
import { ISnapshot } from "../interfaces/snapshot.interface";

const SnapshotSchema = new Schema<ISnapshot>({
    sessionId : { type : Schema.Types.ObjectId, ref : 'Session', required : true },
    version : { type : Number, required : true , default : 0 },
    snapshot : { type : Buffer, required : true }
},{ timestamps : true })

SnapshotSchema.index({ sessionId: 1, version: -1 }, { unique: true });

export const SnapshotModel = mongoose.model<ISnapshot>('Snapshot', SnapshotSchema);