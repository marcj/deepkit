import { brokerTarget } from '../broker-load.js';
import { nodeRedisLibrary } from './redis-clients.js';

export const target = brokerTarget(nodeRedisLibrary(process.env.REDIS_SERVER ?? 'redis-server'));
