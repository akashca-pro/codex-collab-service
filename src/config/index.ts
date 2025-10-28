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
    KAFKA_COLLAB_SERVICE_CLIENT_ID: string;
    KAFKA_BROKERS: string;
    KAFKA_MAX_RETRIES: number;
    KAFKA_RETRY_QUEUE_CAP: number; 
    COLLAB_SERVICE_DATABASE_URL: string;
    JWT_INVITE_TOKEN_SECRET : string;
    PODNAME : string;
    GRPC_COLLAB_SERVICE_URL : string;
    SOCKET_PORT : number;
}

export const config : Config = {
    REDIS_URL : process.env.REDIS_URL || '',
    NATS_URL : process.env.NATS_URL || '',
    SERVICE_NAME : 'COLLAB_SERVICE',
    WSS_PORT : Number(process.env.WSS_PORT),
    JWT_ACCESS_TOKEN_SECRET : process.env.JWT_ACCESS_TOKEN_SECRET || '',
    CLIENT_URL : process.env.CLIENT_URL || '',
    TOKEN_NAME : process.env.TOKEN_NAME || '' ,
    SOCKET_MAP_CACHE_EXPIRY : Number(process.env.SOCKET_MAP_CACHE_EXPIRY),
    KAFKA_COLLAB_SERVICE_CLIENT_ID: process.env.KAFKA_COLLAB_SERVICE_CLIENT_ID!,
    KAFKA_BROKERS : process.env.KAFKA_BROKERS!,
    KAFKA_MAX_RETRIES : Number(process.env.KAFKA_MAX_RETRIES)!,
    KAFKA_RETRY_QUEUE_CAP : Number(process.env.KAFKA_RETRY_QUEUE_CAP)!,
    COLLAB_SERVICE_DATABASE_URL: process.env.COLLAB_SERVICE_DATABASE_URL!,
    JWT_INVITE_TOKEN_SECRET : process.env.JWT_INVITE_TOKEN_SECRET!,
    PODNAME : process.env.PODNAME!,
    GRPC_COLLAB_SERVICE_URL : process.env.GRPC_COLLAB_SERVICE_URL!,
    SOCKET_PORT : Number(process.env.SOCKET_PORT),
}