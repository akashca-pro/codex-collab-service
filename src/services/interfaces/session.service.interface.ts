import { Language } from "@/const/language.const";
import { ResponseDTO } from "@/dtos/ResponseDTO";
import { YjsUpdate } from "@/types/client-server.types";
import { Socket, Server } from "socket.io";

export interface ISessionService {

    createSession(
        ownerId : string,
    ) : Promise<ResponseDTO>;

    closeSession(
        socket : Socket,
        io : Server
    ) : Promise<void>;

    joinSession(
        socket : Socket,
        io : Server
    ) : Promise<void>;

    updateDocument(
        socket : Socket,
        update : YjsUpdate,
        io : Server
    ) : Promise<void>;

    leaveSession(
        socket : Socket,
    ) : Promise<void>

    changeLanguage(
      socket: Socket,
      io: Server,
      language: Language
    ) : Promise<void>

    handleAwarenessUpdate(
        socket : Socket,
        update : YjsUpdate
    ) : Promise<void>

}