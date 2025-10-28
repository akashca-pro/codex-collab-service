import { ISnapshot } from "@/db/interfaces/snapshot.interface";
import { BaseRepository } from "../base.repo";
import { Language } from "@/const/language.const";

/**
 * Interface representing snapshot repo
 * 
 * @interface
 */
export interface ISnapshotRepo extends BaseRepository<ISnapshot>{

    saveSnapshot(
        sessionId : string,
        snapshot : Buffer,
        language : Language
    ) : Promise<void>

    getLatestSnapshot(
        sessionId : string
    ) : Promise<Buffer | null>

}