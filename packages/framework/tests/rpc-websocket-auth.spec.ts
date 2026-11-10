import { expect, test } from '@jest/globals';

import { App } from '@deepkit/app';
import { RpcKernelSecurity, RpcWebSocketClient, Session, SessionState, rpc } from '@deepkit/rpc';

import { ApplicationServer } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';
import { BigController } from './fixtures/big-schema.js';

test('token authentication over a real WebSocket connection', async () => {
    class AnonymousSession extends Session {
        constructor(public anonymousUserId: string) {
            super('anonymous', '');
        }
    }

    class AppSecurity extends RpcKernelSecurity {
        async authenticate(token: any): Promise<Session> {
            if (token?.anonymousUserId) return new AnonymousSession(token.anonymousUserId);
            throw new Error('Invalid token');
        }
    }

    @rpc.controller('/main')
    class Controller {
        constructor(private sessionState: SessionState) {}

        @rpc.action()
        whoami(): string {
            const session = this.sessionState.getSession();
            return session instanceof AnonymousSession ? session.anonymousUserId : 'none';
        }
    }

    const app = new App({
        controllers: [Controller, BigController],
        providers: [{ provide: RpcKernelSecurity, useClass: AppSecurity, scope: 'rpc' }],
        imports: [new FrameworkModule({ port: 0 })],
    });
    const server = app.get(ApplicationServer);
    await server.start();
    try {
        // start() resolves when the server listens
        const port = (server.getHttpWorker() as any).server.address().port;
        const client = new RpcWebSocketClient(`ws://127.0.0.1:${port}`);
        client.token.set({ anonymousUserId: 'user-1' });
        try {
            expect(await client.controller<Controller>('/main').whoami()).toBe('user-1');
        } finally {
            client.disconnect();
        }

        const invalid = new RpcWebSocketClient(`ws://127.0.0.1:${port}`);
        invalid.token.set({ nope: true });
        try {
            await expect(invalid.controller<Controller>('/main').whoami()).rejects.toThrow('Authentication failed');
        } finally {
            invalid.disconnect();
        }
    } finally {
        await server.close();
    }
}, 20_000);
