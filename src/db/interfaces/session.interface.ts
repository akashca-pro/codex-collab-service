import { Language } from "@/const/language.const";
import { type Status } from "@/const/status.const";
import { Document } from "mongoose";

export interface ISession extends Document {
  ownerId: string; // The user ID of the session creator
  participants: string[]; // Array of user IDs currently in the session
  language : Language
  status: Status;
  endedAt: Date | null; // Null until the session is terminated
  createdAt : Date;
  updatedAt : Date;
}