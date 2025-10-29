import { ISession } from "@/db/interfaces/session.interface";
import { BaseRepository } from "../base.repo";


/**
 * Interface for session repository.
 * 
 * @interface ISessionRepo
 */
export interface ISessionRepo extends BaseRepository<ISession> {
    findSessionById(sessionId : string) : Promise<ISession | null>
    findActiveSessionByOwnerId(ownerId : string) : Promise<ISession | null>
    findSessionByParticipant(userId : string) : Promise<ISession | null>
    updateSessionDetails(sessionId : string, updatedData : Partial<ISession>) : Promise<void>
    removeParticipant(sessionId : string, userId : string) : Promise<boolean>;
    closeSession(sessionId : string, ownerId : string) : Promise<boolean>;
    markExpiredSessionsEnded(now?: Date) : Promise<number>;
}