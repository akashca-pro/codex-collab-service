import { ISnapshot } from "@/db/interfaces/snapshot.interface";
import { BaseRepository } from "../base.repo";

/**
 * Interface representing snapshot repo
 * 
 * @interface
 */
export interface ISnapshotRepo extends BaseRepository<ISnapshot>{

    saveSnapshot(
        sessionId : string,
        snapshot : Buffer,
    ) : Promise<void>

    getLatestSnapshot(
        sessionId : string
    ) : Promise<Buffer | null>

}