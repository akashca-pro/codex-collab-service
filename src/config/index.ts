import dotenv from 'dotenv';
dotenv.config();

interface Config {
    REDIS_URL : string;
    NATS_URL : string;
    SERVICE_NAME : string;
    WSS_PORT : number;
    JWT_ACCESS_TOKEN_SECRET : string;
    CLIENT_URL : string;
    TOKEN_NAME : string;
    SOCKET_MAP_CACHE_EXPIRY : number;
}

export const config : Config = {
    REDIS_URL : process.env.REDIS_URL || '',
    NATS_URL : process.env.NATS_URL || '',
    SERVICE_NAME : process.env.SERVICE_NAME || '',
    WSS_PORT : Number(process.env.WSS_PORT),
    JWT_ACCESS_TOKEN_SECRET : process.env.JWT_ACCESS_TOKEN_SECRET || '',
    CLIENT_URL : process.env.CLIENT_URL || '',
    TOKEN_NAME : process.env.TOKEN_NAME || '' ,
    SOCKET_MAP_CACHE_EXPIRY : Number(process.env.SOCKET_MAP_CACHE_EXPIRY)
}