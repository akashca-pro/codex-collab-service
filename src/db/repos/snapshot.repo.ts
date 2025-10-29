import mongoose from "mongoose";
import { ISnapshot } from "../interfaces/snapshot.interface";
import { BaseRepository } from "./base.repo";
import { ISnapshotRepo } from "./interfaces/snapshot.repo.interface";
import logger from '@/utils/pinoLogger'; 
import { Language } from "@/const/language.const";
import { SnapshotModel } from "../models/snapshot.model";

export class SnapshotRepo extends BaseRepository<ISnapshot> implements ISnapshotRepo {

    constructor(){
        super(SnapshotModel)
    }

    async saveSnapshot(
        sessionId: string,
        snapshot: Buffer,
        language : Language
    ): Promise<void> {
        const startTime = Date.now();
        const operation = `saveSnapshot:${this._model.modelName}`;
        const sessionObjectId = new mongoose.Types.ObjectId(sessionId);
        try {
            logger.debug(`[REPO] Executing ${operation}`, { sessionId });
            await this.create({
                sessionId: sessionObjectId,
                snapshot,
                language
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
            ).lean()

            const found = !!result;
            logger.info(`[REPO] ${operation} successful`, { found, sessionId, duration: Date.now() - startTime });
            return result ? result.snapshot : null
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, sessionId, duration: Date.now() - startTime });
            throw error;
        }
    }
}