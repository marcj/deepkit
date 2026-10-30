import { BrokerBus, BrokerDeepkitAdapter, BrokerMemoryAdapter } from '@deepkit/broker';
import { FrameworkConfig } from '../module.config.js';
import { getBrokerServers } from '../broker.js';

/**
 * Transports debug frames from the stopwatch store to the debugger's live view.
 *
 * Without workers, both run in the same process, so an in-process broker is used and no broker server is needed.
 * With workers, frames of all processes go through the configured broker.
 */
export class DebugBrokerBus extends BrokerBus {
    constructor(config: FrameworkConfig) {
        super(config.workers > 0 ? new BrokerDeepkitAdapter({ servers: getBrokerServers(config.broker) }) : new BrokerMemoryAdapter());
    }
}
