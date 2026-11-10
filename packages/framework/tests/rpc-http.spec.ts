import { expect, test } from '@jest/globals';

import { App } from '@deepkit/app';
import { RpcClient, RpcHttpClientAdapter, RpcKernelSecurity, Session, SessionState, rpc } from '@deepkit/rpc';
import { MinLength } from '@deepkit/type';

import { ApplicationServer } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';

class User {
    created: Date = new Date('2026-01-02T03:04:05Z');

    constructor(
        public id: number,
        public name: string & MinLength<3>,
    ) {}

    greet(): string {
        return 'Hi ' + this.name;
    }
}

class TokenSecurity extends RpcKernelSecurity {
    async authenticate(token: any): Promise<Session> {
        if (token === 'secret') return new Session('peter', token);
        throw new Error('Invalid token');
    }
}

@rpc.controller('/user')
class UserController {
    constructor(private sessionState: SessionState) {}

    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    create(user: User): User {
        return new User(user.id + 1, user.name.toUpperCase());
    }

    @rpc.action()
    list(): User[] {
        return [new User(1, 'Peter'), new User(2, 'Marie')];
    }

    @rpc.action()
    fail(): void {
        throw new Error('nope');
    }

    @rpc.action()
    whoami(): string {
        return this.sessionState.getSession().username;
    }
}

test('RPC over HTTP through the framework with RpcHttpClientAdapter', async () => {
    const app = new App({
        controllers: [UserController],
        providers: [{ provide: RpcKernelSecurity, useClass: TokenSecurity, scope: 'rpc' }],
        imports: [new FrameworkModule({ port: 0, httpRpcBasePath: '/api/v1' })],
    });
    const server = app.get(ApplicationServer);
    await server.start();
    try {
        const port = (server.getHttpWorker() as any).server.address().port;
        const client = new RpcClient(new RpcHttpClientAdapter(`http://127.0.0.1:${port}/api/v1`));
        const user = client.controller<UserController>('/user');

        // primitive arguments go as GET query
        expect(await user.add(2, 3)).toBe(5);

        // an object argument goes as POST body. The result is an instance of the class described by the
        // server's types (like over WebSocket), its Date is a Date again. Validating it made the methods of
        // that class fail ("greet: Not a function").
        const created = await user.create(new User(1, 'peter'));
        expect(created.constructor.name).toBe('User');
        expect(created).toMatchObject({ id: 2, name: 'PETER' });
        expect(created.created).toBeInstanceOf(Date);

        const users = await user.list();
        expect(users.map(v => [v.constructor.name, v.name])).toEqual([
            ['User', 'Peter'],
            ['User', 'Marie'],
        ]);

        // validation of the arguments on the server
        await expect(user.create(new User(1, 'ab'))).rejects.toThrow('Min length is 3');

        // errors of the action arrive as errors
        await expect(user.fail()).rejects.toThrow('nope');

        // the token is sent as Authorization header and authenticates the session of the request.
        // The kernel read 'Authorization', node lowercases incoming header names, so it never authenticated.
        expect(await user.whoami()).toBe('anon');
        client.token.set('secret');
        expect(await user.whoami()).toBe('peter');

        // like over a connection: the reason stays on the server, it was sent to the client ("Invalid token")
        client.token.set('wrong');
        await expect(user.whoami()).rejects.toThrow('Authentication failed');
    } finally {
        await server.close();
    }
});
