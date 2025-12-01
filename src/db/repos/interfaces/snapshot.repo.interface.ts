import { ISnapshot } from "@/db/interfaces/snapshot.interface";
import { BaseRepository } from "../base.repo";
import { Language } from "@/const/language.const";
import { ActiveSessionMetadata } from "@/types/document.types";


/**
 * Interface representing snapshot repo
 * 
 * @interface
 */
export interface ISnapshotRepo extends BaseRepository<ISnapshot>{

    saveSnapshot(
        sessionId : string,
        snapshot : Buffer,
        language : Language,
        fontSize : number,
        intelliSense : boolean
    ) : Promise<void>

    getLatestSnapshot(
        sessionId : string
    ) : Promise<Buffer | null>

    getLatestMetadata(
        sessionId : string 
    ) : Promise<ActiveSessionMetadata | null>

}