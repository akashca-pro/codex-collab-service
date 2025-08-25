import 'reflect-metadata'
import { Container } from "inversify";
import TYPES from './types'
import { ICacheProvider } from '@/providers/interfaces/ICacheProvider.interface';
import { RedisCacheProvider } from '@/providers/redisCacheProvider';
import { IMessageProvider } from '@/providers/interfaces/IMessageProvider.interface';
import { NatsMessageProvider } from '@/providers/natsMessageProvider';
import { SubmitCodeExecService } from '@/modules/submissions/SubmitCodeExec.service';
import { ISocketManager } from '../socket/socketManager.interface';
import { SocketManager } from '../socket/socketManager';


const container = new Container();

// Providers
container
    .bind<ICacheProvider>(TYPES.ICacheProvider)
    .to(RedisCacheProvider).inSingletonScope();
container
    .bind<IMessageProvider>(TYPES.IMessageProvider)
    .to(NatsMessageProvider).inSingletonScope();

// Socket manager
container
    .bind<ISocketManager>(TYPES.ISocketManager)
    .to(SocketManager).inSingletonScope();

// Code manage services
container
    .bind<SubmitCodeExecService>(TYPES.SubmitCodeExecService)
    .to(SubmitCodeExecService).inSingletonScope();

export default container;