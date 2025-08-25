import cookie from 'cookie'
import { Server } from "socket.io";
import { verifyToken } from "@/utils/auth/authMiddleware";
import { config } from "..";

export function createSocketServer(httpServer : any) {
    const io = new Server(httpServer,{
        cors : { origin : config.CLIENT_URL, credentials : true }
    });

    // auth middleware
    io.use((socket,next)=>{
        try {
            const cookies = cookie.parse(socket.request.headers.cookie || '');
            const token = cookies[config.TOKEN_NAME];
            if (!token) {
                return next(new Error("Unauthorized: No token"));
            }
            const userId = verifyToken(token);
            if (!userId) {
                return next(new Error("Unauthorized: Invalid token"));
            }
            socket.data.user.Id = userId;
            next();
        } catch (error) {
            next(new Error('Unauthorized!'));
        }
    });

    return io;

}