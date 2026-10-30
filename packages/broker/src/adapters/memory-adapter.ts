import { BrokerDeepkitAdapter } from './deepkit-adapter.js';
import { BrokerKernel } from '../kernel.js';
import { RpcDirectClientAdapter } from '@deepkit/rpc';

/**
 * In-process broker: uses the in-memory broker kernel (server)
 * and communicates with it via in-memory RPC transport adapter. For tests and single-process setups.
 */
export class BrokerMemoryAdapter extends BrokerDeepkitAdapter {
    constructor() {
        const kernel = new BrokerKernel();
        const transport = new RpcDirectClientAdapter(kernel);
        super({ servers: [{ url: '', transport }] });
    }
}

