import mongoose from "mongoose";
import { ISnapshot } from "../interfaces/snapshot.interface";
import { BaseRepository } from "./base.repo";
import { ISnapshotRepo } from "./interfaces/snapshot.repo.interface";
// Assuming this path is correct for your project
import logger from '@/utils/pinoLogger'; 

export class SnapshotRepo extends BaseRepository<ISnapshot> implements ISnapshotRepo {

    async saveSnapshot(
        sessionId: string,
        snapshot: Buffer,
    ): Promise<void> {
        const startTime = Date.now();
        const operation = `saveSnapshot:${this._model.modelName}`;
        const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
        try {
            logger.debug(`[REPO] Executing ${operation}`, { sessionId });
            const latestVersion = await this.getLatestVersion(sessionObjectId);
            await this.create({
                sessionId: sessionObjectId,
                version: latestVersion + 1,
                snapshot
            });
            logger.info(`[REPO] ${operation} successful`, { sessionId, duration: Date.now() - startTime });
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, duration: Date.now() - startTime });
            throw error;
        }
    }

    async getLatestSnapshot(
        sessionId: string
    ): Promise<Buffer | null> {
        const startTime = Date.now();
        const operation = `getLatestSnapshot:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { sessionId });

            const result = await this._model.findOne(
                { sessionId: new mongoose.Types.ObjectId(sessionId) },
                { snapshot: 1, _id: 0 } 
            )
            .sort({ version : -1 }).lean();

            const found = !!result;
            logger.info(`[REPO] ${operation} successful`, { found, sessionId, duration: Date.now() - startTime });
            return result ? result.snapshot : null
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, duration: Date.now() - startTime });
            throw error;
        }
    }

    private async getLatestVersion(sessionId: mongoose.Types.ObjectId): Promise<number> {
        const result = await this._model.findOne({ sessionId })
            .sort({ version: -1 })
            .select('version')
            .lean();
        return result ? result.version : 0;
    }
}