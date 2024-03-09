import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import {
  getApi,
  setPolkadotDecimals,
  setPolkadotEndpoint,
} from 'apps/libs/util';
import fastify from 'fastify';
import pino from 'pino';
import pretty from 'pino-pretty';
import { createContextProxy } from './context';
import { appRouter } from './router';

export interface ServerOptions {
  dev?: boolean;
  port?: number;
  prefix?: string;
  environment: 'development' | 'production' | 'test' | 'local';
  dotaApiUrl: string;
  marketAccountMnemonic: string;
  marketAccount: string;
  polkadotEndpoint: string;
  polkadotDecimals: number;
  serverFeeRate: number;
  minSellTotalPrice: number;
}

export async function createServer(opts: ServerOptions) {
  const port = opts.port ?? 3000;
  const prefix = opts.prefix ?? '/trpc';

  const stream = pretty({
    colorize: true,
    translateTime: 'HH:MM:ss Z',
    ignore: 'pid,hostname',
  });
  const prettyLogger = pino({ level: 'debug' }, stream);

  setPolkadotDecimals(opts.polkadotDecimals);
  setPolkadotEndpoint(opts.polkadotEndpoint);

  const server = fastify({
    logger:
      opts.environment === 'local' || opts.environment === 'test'
        ? prettyLogger
        : true,
  });

  server.register(cors, {
    origin: '*',
    methods: '*',
  });

  // 初始化波卡rpc api
  await getApi();

  const createContext = await createContextProxy(opts);
  server.register(fastifyTRPCPlugin, {
    prefix,
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  const stop = () => server.close();
  const start = async () => {
    try {
      await server.listen({ port });
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  return { server, start, stop };
}
