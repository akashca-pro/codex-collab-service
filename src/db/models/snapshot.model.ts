import mongoose, { Schema } from "mongoose";
import { ISnapshot } from "../interfaces/snapshot.interface";
import { LANGUAGE } from "@/const/language.const";
import { config } from "@/config";

const SnapshotSchema = new Schema<ISnapshot>({
    sessionId : { type : Schema.Types.ObjectId, ref : 'Session', required : true },
    language : { type : String, enum : Object.values(LANGUAGE), required : true },
    fontSize : { type : Number, default : 16 },
    intelliSense : { type : Boolean, default : false },
    snapshot : { type : Buffer, required : true }
},{ timestamps : true })

SnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.SNAPSHOT_TTL_SECONDS });

export const SnapshotModel = mongoose.model<ISnapshot>('Snapshot', SnapshotSchema);