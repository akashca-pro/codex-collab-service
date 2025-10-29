import mongoose, { Schema } from "mongoose";
import { ISession } from "../interfaces/session.interface";
import { STATUS } from "@/const/status.const";
import { LANGUAGE } from "@/const/language.const";

const SessionSchema = new Schema<ISession>({
    ownerId : { type : String, required : true },
    participants : { type : [String], default : [] },
    inviteToken : { type : String, default : null },
    language : { type : String, enum : Object.values(LANGUAGE), default : LANGUAGE.JAVASCRIPT },
    status : { type : String, enum : Object.values(STATUS), default : STATUS.ACTIVE },
    endedAt : { type : Date, default : null }
},{ timestamps : true })

SessionSchema.index({ createdAt: -1 }); 

export const SessionModel = mongoose.model<ISession>('Session', SessionSchema)