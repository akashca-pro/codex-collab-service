import { Language } from "@/const/language.const";
import { type Status } from "@/const/status.const";
import { Document } from "mongoose";

export interface ISession extends Document {
  ownerId: string; // The user ID of the session creator
  participants: string[]; // Array of user IDs currently in the session
  inviteToken : string;
  language : Language
  fontSize : number;
  intelliSense : boolean;
  status: Status;
  endsAt: Date | null; // Null until the session is terminated
  isClosed : boolean;
  createdAt : Date;
  updatedAt : Date;
}