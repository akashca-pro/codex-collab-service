import 'reflect-metadata'
import { Container } from "inversify";
import TYPES from './types'
import { ICacheProvider } from '@/providers/interfaces/ICacheProvider.interface';
import { RedisCacheProvider } from '@/providers/redisCacheProvider';
import { SocketManager } from '../socket/socketManager';
import { KafkaManager } from '../kafka/kafkaManager';
import { ISessionRepo } from '@/db/repos/interfaces/session.repo.interface';
import { ISnapshotRepo } from '@/db/repos/interfaces/snapshot.repo.interface';
import { SnapshotRepo } from '@/db/repos/snapshot.repo';
import { SessionRepo } from '@/db/repos/session.repo';
import { ISessionService } from '@/services/interfaces/session.service.interface';
import { SessionService } from '@/services/session.service';
import { RedisService } from '@/services/Redis.service';


const container = new Container();

// Providers
container
    .bind<ICacheProvider>(TYPES.ICacheProvider)
    .to(RedisCacheProvider).inSingletonScope();

// Socket manager
container
    .bind<SocketManager>(TYPES.SocketManager)
    .to(SocketManager).inSingletonScope();

container
    .bind<KafkaManager>(TYPES.KafkaManager)
    .toConstantValue(KafkaManager.getInstance())

container
    .bind<ISnapshotRepo>(TYPES.ISnapshotRepo)
    .to(SnapshotRepo).inSingletonScope();

container
    .bind<ISessionRepo>(TYPES.ISessionRepo)
    .to(SessionRepo).inSingletonScope();

container
    .bind<ISessionService>(TYPES.ISessionService)
    .to(SessionService).inSingletonScope();

container
    .bind<RedisService>(TYPES.RedisService)
    .to(RedisService).inSingletonScope();

export default container;