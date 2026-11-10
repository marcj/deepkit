import { expect, test } from '@jest/globals';

import { App } from '@deepkit/app';
import { rpcErrorSettings } from '@deepkit/rpc';

import { FrameworkModule } from '../src/module.js';

test('stack traces of RPC errors follow the debug option', () => {
    new App({ imports: [new FrameworkModule({ debug: true })] }).serviceContainer.process();
    expect(rpcErrorSettings.exposeStack).toBe(true);

    new App({ imports: [new FrameworkModule()] }).serviceContainer.process();
    expect(rpcErrorSettings.exposeStack).toBe(false);
});
