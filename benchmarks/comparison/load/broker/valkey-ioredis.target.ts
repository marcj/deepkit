import { brokerTarget } from '../broker-load.js';
import { ioredisLibrary } from './redis-clients.js';

export const target = brokerTarget(ioredisLibrary(process.env.VALKEY_SERVER ?? 'valkey-server'));
