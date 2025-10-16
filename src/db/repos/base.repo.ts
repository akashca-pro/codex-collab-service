import { Model, Document, FilterQuery, UpdateQuery, LeanDocument, SortOrder } from 'mongoose';
import logger from '@/utils/pinoLogger'; // Import the logger
import { Sort } from 'mongodb';

/**
 * Abstract base class for a generic repository.
 * Provides common CRUD operations for a Mongoose model.
 *
 * @template T - The type of the Mongoose document.
 */
export abstract class BaseRepository <T extends Document> {

    protected _model : Model<T>;

    constructor(model : Model<T>){
        this._model = model;
    }

    /**
     * Creates a new document.
     * @param data - The data for the new document.
     * @returns The created document.
     */
    async create(data : Partial<T>) : Promise<T> {
        const startTime = Date.now();
        const operation = `create:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`);
            const result = await this._model.create(data)
            logger.info(`[REPO] ${operation} successful`, { id: result._id.toString(), duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, duration: Date.now() - startTime });
            throw error;
        }
    }

    /**
     * Finds a document by its ID.
     * @param documentId - The ID of the document.
     * @returns The found document or null.
     */
    async findById(documentId : string) : Promise<T | null> {
        const startTime = Date.now();
        const operation = `findById:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { documentId });
            const result = await this._model.findById(documentId)
            const found = !!result;
            logger.info(`[REPO] ${operation} successful`, { found, documentId, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, documentId, duration: Date.now() - startTime });
            throw error;
        }
    }

    /**
     * Finds all documents that match the query.
     * @param filter - The filter query.
     * @returns An array of found documents.
     */
    async find(filter : FilterQuery<T>) : Promise<T[]> {
        const startTime = Date.now();
        const operation = `find:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { filter });
            const result = await this._model.find(filter)
            logger.info(`[REPO] ${operation} successful`, { count: result.length, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, filter, duration: Date.now() - startTime });
            throw error;
        }
    }

    /**
     * Finds all documents matching the filter and returns them as plain objects (lean).
     * @param filter - The MongoDB filter query.
     * @returns An array of lean documents.
     */
    async findLean(filter: FilterQuery<T>): Promise<LeanDocument<T>[]> {
        const startTime = Date.now();
        const operation = `findLean:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { filter });
            const result = await this._model.find(filter).lean();
            logger.info(`[REPO] ${operation} successful`, { count: result.length, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, filter, duration: Date.now() - startTime });
            throw error;
        }
    }


    /**
     * Updates a document by its ID.
     * @param documentId - The ID of the document to update.
     * @param update - The update query.
     */
    async update(documentId : string, update : UpdateQuery<T>) : Promise<T | null> {
        const startTime = Date.now();
        const operation = `update:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { documentId, updateKeys: Object.keys(update) });
            const result = await this._model.findByIdAndUpdate(documentId, update, { new : true });
            const updated = !!result;
            logger.info(`[REPO] ${operation} successful`, { updated, documentId, duration: Date.now() - startTime });
            return result as unknown as T | null; 
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, documentId, duration: Date.now() - startTime });
            throw error;
        }
    }

    /**
     * * @param filter - The filter query.
     * @returns The count of documents.
     */
    async countDocuments(filter : FilterQuery<T>) : Promise<number> {
        const startTime = Date.now();
        const operation = `countDocuments:${this._model.modelName}`;
        try {
            logger.debug(`[REPO] Executing ${operation}`, { filter });
            const count = await this._model.countDocuments(filter);
            logger.info(`[REPO] ${operation} successful`, { count, duration: Date.now() - startTime });
            return count;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, filter, duration: Date.now() - startTime });
            throw error;
        }
    }

    /**
     * Deletes a document by its ID.
     * @param documentId - The ID of the document to delete.
     * @returns The deleted document or null.
     */
    async delete(documentId: string): Promise<T | null> {
        const startTime = Date.now();
        const operation = `delete:${this._model.modelName}`;
        try {
            logger.warn(`[REPO] Executing ${operation} (HARD DELETE)`, { documentId });
            const result = await this._model.findByIdAndDelete(documentId).exec();
            const deleted = !!result;
            logger.info(`[REPO] ${operation} successful`, { deleted, documentId, duration: Date.now() - startTime });
            return result;
        } catch (error) {
            logger.error(`[REPO] ${operation} failed`, { error, documentId, duration: Date.now() - startTime });
            throw error;
        }
    }
}