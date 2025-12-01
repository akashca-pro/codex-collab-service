import mongoose, { Schema } from "mongoose";
import { ISession } from "../interfaces/session.interface";
import { STATUS } from "@/const/status.const";
import { LANGUAGE } from "@/const/language.const";

const SessionSchema = new Schema<ISession>({
    ownerId : { type : String, required : true },
    participants : { type : [String], default : [] },
    inviteToken : { type : String, default : null },
    language : { type : String, enum : Object.values(LANGUAGE), default : LANGUAGE.JAVASCRIPT },
    fontSize : { type : Number, default : 16 },
    intelliSense : { type : Boolean, default : false },
    status : { type : String, enum : Object.values(STATUS), default : STATUS.ACTIVE },
    endsAt : { type : Date, default : () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    isClosed : { type : Boolean, default : false },
},{ timestamps : true })

SessionSchema.index({ createdAt: -1 }); 

export const SessionModel = mongoose.model<ISession>('Session', SessionSchema)