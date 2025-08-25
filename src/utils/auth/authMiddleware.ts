import jwt from 'jsonwebtoken'
import { config } from '@/config'
import { REDIS_KEY_PREFIX } from '@/config/redis/keyPrefix';
import redis from '@/config/redis';
import { CustomJwtPayload } from '@akashcapro/codex-shared-utils'
import logger from '@akashcapro/codex-shared-utils/dist/utils/logger';

const verifyJwt = (token : string,secret : string) : CustomJwtPayload => {
    return jwt.verify(token,secret) as CustomJwtPayload
}

export function verifyToken(token : string) : string | null{
    try {
        const decoded = verifyJwt(token,config.JWT_ACCESS_TOKEN_SECRET);
        redis.get(`${REDIS_KEY_PREFIX.BLACKLIST_ACCESS_TOKEN}${decoded.tokenId}`)
            .then((result)=>{
                if(result){
                    return null;
                }
        })
        return decoded.userId
    } catch (error) {
        logger.error('JWT access token verification failed',error);
        return null
    }
}