import { Server } from "socket.io";
import { config } from "..";

export function createSocketServer(httpServer : any) {
    const io = new Server(httpServer,{
        cors : { origin : config.CLIENT_URL, credentials : true }
    });
    return io;
}