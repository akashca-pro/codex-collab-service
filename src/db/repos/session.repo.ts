import logger from '@/utils/pinoLogger'; 
import { ISession } from "../interfaces/session.interface";
import { BaseRepository } from "./base.repo";
import { ISessionRepo } from "./interfaces/session.repo.interface";
import { STATUS } from '@/const/status.const';
import { SessionModel } from '../models/session.model';
import { ISessionStats } from '@/dtos/dashboard.dto';


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

    async findActiveOrOfflineSessionByOwnerId(
        ownerId: string
    ): Promise<ISession | null> {
        const startTime = Date.now();
        const operation = `findSessionByOwnerId:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { ownerId });
            const result = await this._model.findOne({
                ownerId,
                $or: [
                    { status: STATUS.ACTIVE },
                    { status: STATUS.OFFLINE }
                ]
            });
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

    async markExpiredSessionsEnded(now: Date = new Date()): Promise<number> {
        const startTime = Date.now();
        const operation = `markExpiredSessionsEnded:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { now });
            const result = await this._model.updateMany(
                { status: { $ne: STATUS.ENDED }, endsAt: { $lte: now } },
                { $set: { status: STATUS.ENDED } }
            );
            const modified = result.modifiedCount ?? (result as any).nModified ?? 0;
            logger.info(`[REPO] ${operation} successful`, { modified, duration: Date.now() - startTime });
            return modified;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, duration: Date.now() - startTime });
            throw error;
        }
    }

    async getSessionStats(): 
    Promise<ISessionStats> {
        const startTime = Date.now();
        const operation = `getSessionStats:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`);

            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            // 1. Aggregate total sessions by status
            const totalStats = await this._model.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ]);

            // 2. Aggregate today's sessions by status
            const todayStats = await this._model.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startOfToday },
                    },
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ]);

            // Helper to format the data into object { active: x, ended: y, offline: z }
            const formatStats = (arr: any[]) =>
                arr.reduce(
                    (acc, { _id, count }) => {
                        acc[_id] = count;
                        return acc;
                    },
                    {
                        [STATUS.ACTIVE]: 0,
                        [STATUS.ENDED]: 0,
                        [STATUS.OFFLINE]: 0,
                    }
                );

            const result = {
                total: formatStats(totalStats),
                today: formatStats(todayStats),
            };

            logger.info(`[REPO] ${operation} successful`, {
                result,
                duration: Date.now() - startTime,
            });

            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, {
                error,
                duration: Date.now() - startTime,
            });
            throw error;
        }
    }
}