import logger from '@/utils/pinoLogger'; 
import { ISession } from "../interfaces/session.interface";
import { BaseRepository } from "./base.repo";
import { ISessionRepo } from "./interfaces/session.repo.interface";
import { STATUS } from '@/const/status.const';
import { SessionModel } from '../models/session.model';


export class SessionRepo extends BaseRepository<ISession> implements ISessionRepo {

    constructor(){
        super(SessionModel);
    }

    async findSessionById(
        sessionId: string
    ): Promise<ISession | null> {
        const startTime = Date.now();
        const operation = `findSessionById:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { sessionId });
            const result = await this._model.findById(sessionId);
            const found = !!result;
            logger.info(`[REPO] ${operation} successful`, { found, sessionId, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, duration: Date.now() - startTime });
            throw error;
        }
    }

    async findActiveSessionByOwnerId(
        ownerId: string
    ): Promise<ISession | null> {
        const startTime = Date.now();
        const operation = `findSessionByOwnerId:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { ownerId });
            const result = await this._model.findOne({ ownerId , status : STATUS.ACTIVE });
            const found = !!result;
            logger.info(`[REPO] ${operation} successful`, { found, ownerId, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, ownerId, duration: Date.now() - startTime });
            throw error;
        }
    }

    async findSessionByParticipant(
        userId: string
    ): Promise<ISession | null> {
        const startTime = Date.now();
        const operation = `findSessionByParticipant:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { userId });
            const result = await this._model.findOne({
                participants : { $in : userId }
            });
            const found = !!result;
            logger.info(`[REPO] ${operation} successful`, { found, userId, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, userId, duration: Date.now() - startTime });
            throw error;
        }
    }

    async updateSessionDetails(
        sessionId: string, 
        updatedData: Partial<ISession>
    ): Promise<void> {
        const startTime = Date.now();
        const operation = `updateSessionDetails:${this._model.modelName}`;
        try {
            const updatedKeys = Object.keys(updatedData);
            logger.debug(`[REPO] Executing ${operation}`, { sessionId, updatedKeys });
            await this.update(sessionId, updatedData); // Assuming this.update handles the actual update
            logger.info(`[REPO] ${operation} successful`, { sessionId, updatedKeys, duration: Date.now() - startTime });
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, duration: Date.now() - startTime });
            throw error;
        }
    }

    async removeParticipant(
        sessionId: string,
        userId : string
    ): Promise<boolean> {
        const startTime = Date.now();
        const operation = `leaveSession:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { sessionId, userId });
            const result = await this._model.updateOne(
                { _id : sessionId},
                { 
                    $pull: { 
                        participants: userId
                    }
                }
            );
            const modified = result.modifiedCount > 0;
            logger.info(`[REPO] ${operation} successful`, { sessionId, userId, modified, duration: Date.now() - startTime });
            return modified;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, userId, duration: Date.now() - startTime });
            throw error;
        }
    }

    async closeSession(
        sessionId: string,
        ownerId : string
    ): Promise<boolean> {
        const startTime = Date.now();
        const operation = `closeSession:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { sessionId, ownerId });
            const result = await this._model.updateOne(
                { _id : sessionId , ownerId},
                { $set : { status : STATUS.ENDED } }
            );
            const modified = result.modifiedCount > 0;
            logger.info(`[REPO] ${operation} successful`, { sessionId, ownerId, modified, duration: Date.now() - startTime });
            return modified;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, ownerId, duration: Date.now() - startTime });
            throw error;
        }
    }
}