import { expect, test } from '@jest/globals';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { App } from '@deepkit/app';
import { Collection, RpcClient, RpcHttpClientAdapter, RpcWebSocketClient, rpc } from '@deepkit/rpc';
import { PrimaryKey } from '@deepkit/type';

import { ApplicationServer } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';

enum Color {
    red = 'red',
    blue = 'blue',
}

class Address {
    constructor(
        public city: string,
        public at: Date,
    ) {}
}

class Person {
    id: number & PrimaryKey = 0;
    address?: Address;
    tags: string[] = [];

    constructor(public name: string) {}
}

type Shape = { kind: 'circle'; r: number } | { kind: 'square'; size: number };

@rpc.controller('/types')
class TypesController {
    @rpc.action()
    bigint(v: bigint): bigint {
        return v * 2n;
    }

    @rpc.action()
    hugeBigint(): bigint {
        return 2n ** 70n;
    }

    @rpc.action()
    binary(v: Uint8Array): Uint8Array {
        return new Uint8Array([...v, 9]);
    }

    @rpc.action()
    date(v: Date): Date {
        return new Date(v.getTime() + 1000);
    }

    @rpc.action()
    color(v: Color): Color {
        return v === Color.red ? Color.blue : Color.red;
    }

    @rpc.action()
    shape(v: Shape): Shape {
        return v.kind === 'circle' ? { kind: 'square', size: v.r } : { kind: 'circle', r: v.size };
    }

    @rpc.action()
    optional(a?: string, b?: number): string {
        return `${a}|${b}`;
    }

    @rpc.action()
    nothing(): string | undefined {
        return undefined;
    }

    @rpc.action()
    map(): Map<string, number> {
        return new Map([['a', 1]]);
    }

    @rpc.action()
    set(v: Set<number>): Set<number> {
        return new Set([...v, 3]);
    }

    @rpc.action()
    person(p: Person): Person {
        const result = new Person(p.name + '!');
        result.address = new Address('Berlin', new Date('2020-01-01T00:00:00Z'));
        result.tags = [...p.tags, 'x'];
        return result;
    }

    @rpc.action()
    tuple(v: [string, number]): [number, string] {
        return [v[1], v[0]];
    }

    @rpc.action()
    unicode(v: string): string {
        return v + ' ✓ äöü 🚀';
    }

    @rpc.action()
    many(): string[] {
        return Array.from({ length: 20000 }, (_, i) => 'row ' + i);
    }

    @rpc.action()
    observable(): Observable<number> {
        return new Observable(observer => {
            observer.next(1);
            observer.next(2);
            observer.complete();
        });
    }

    @rpc.action()
    subject(): Subject<number> {
        return new BehaviorSubject<number>(7);
    }

    @rpc.action()
    collection(): Collection<Person> {
        const collection = new Collection(Person);
        collection.set([new Person('a')]);
        return collection;
    }
}

test('the same types over WebSocket and HTTP', async () => {
    const app = new App({
        controllers: [TypesController],
        imports: [new FrameworkModule({ port: 0, httpRpcBasePath: '/api' })],
    });
    const server = app.get(ApplicationServer);
    await server.start();
    try {
        const port = (server.getHttpWorker() as any).server.address().port;
        const clients = {
            ws: new RpcWebSocketClient(`ws://127.0.0.1:${port}`),
            http: new RpcClient(new RpcHttpClientAdapter(`http://127.0.0.1:${port}/api`)),
        };
        for (const [transport, client] of Object.entries(clients)) {
            const c = client.controller<TypesController>('/types');
            const person = new Person('peter');
            person.tags = ['a'];

            expect([transport, await c.bigint(1234567890123456789n)]).toEqual([transport, 2469135780246913578n]);
            expect([transport, await c.binary(new Uint8Array([1, 2]))]).toEqual([transport, new Uint8Array([1, 2, 9])]);
            expect([transport, await c.date(new Date('2026-01-01T00:00:00Z'))]).toEqual([transport, new Date('2026-01-01T00:00:01Z')]);
            expect([transport, await c.color(Color.red)]).toEqual([transport, Color.blue]);
            expect([transport, await c.shape({ kind: 'circle', r: 3 })]).toEqual([transport, { kind: 'square', size: 3 }]);
            expect([transport, await c.optional()]).toEqual([transport, 'undefined|undefined']);
            expect([transport, await c.optional('a')]).toEqual([transport, 'a|undefined']);
            expect([transport, await c.nothing()]).toEqual([transport, undefined]);
            expect([transport, await c.map()]).toEqual([transport, new Map([['a', 1]])]);
            expect([transport, await c.set(new Set([1, 2]))]).toEqual([transport, new Set([1, 2, 3])]);
            expect([transport, await c.tuple(['x', 5])]).toEqual([transport, [5, 'x']]);
            expect([transport, await c.unicode('hi')]).toEqual([transport, 'hi ✓ äöü 🚀']);
            expect([transport, (await c.many()).length]).toEqual([transport, 20000]);

            const result = await c.person(person);
            expect([transport, result.constructor.name, result.name, result.tags]).toEqual([transport, 'Person', 'peter!', ['a', 'x']]);
            expect([transport, result.address?.at]).toEqual([transport, new Date('2020-01-01T00:00:00Z')]);
        }

        // a bigint beyond 64 bit is a BSON long and was wrapped around silently over WebSocket;
        // JSON has no limit, so HTTP keeps it
        const ws = clients.ws.controller<TypesController>('/types');
        await expect(ws.bigint(12345678901234567890n)).rejects.toThrow('does not fit into a 64 bit BSON long');
        await expect(ws.hugeBigint()).rejects.toThrow('does not fit into a 64 bit BSON long');
        const http = clients.http.controller<TypesController>('/types');
        expect(await http.bigint(12345678901234567890n)).toBe(24691357802469135780n);
        expect(await http.hugeBigint()).toBe(2n ** 70n);

        // streams need a connection
        const values: number[] = [];
        await new Promise<void>(resolve => ws.observable().then(o => o.subscribe({ next: v => values.push(v), complete: resolve })));
        expect(values).toEqual([1, 2]);
        expect((await ws.collection()).all().map(v => v.name)).toEqual(['a']);
        await expect(http.observable()).rejects.toThrow('returns an Observable, which needs a WebSocket or TCP connection');
        await expect(http.subject()).rejects.toThrow('returns an Observable, which needs a WebSocket or TCP connection');
        await expect(http.collection()).rejects.toThrow('returns a Collection, which needs a WebSocket or TCP connection');

        clients.ws.disconnect();
    } finally {
        await server.close();
    }
}, 60_000);
