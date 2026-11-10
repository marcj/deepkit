// tRPC over HTTP with its standalone server, under load. HTTP/1.1 has no multiplexing, so a client with 8 in-flight calls
// uses 8 sockets of the keep-alive pool of fetch. Arguments are validated with Zod, the usual setup.
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';

import { createUsers } from '../../rpc/shared.js';
import { rpcTarget } from '../rpc-load.js';

const t = initTRPC.create();
const user = z.object({
    id: z.number(),
    name: z.string().min(3),
    email: z.email(),
    active: z.boolean(),
    roles: z.array(z.string()),
});

const router = t.router({
    add: t.procedure.input(z.object({ a: z.number(), b: z.number() })).query(({ input }) => input.a + input.b),
    saveUser: t.procedure.input(user).mutation(({ input }) => input),
    listUsers: t.procedure.input(z.object({ count: z.number() })).query(({ input }) => createUsers(input.count)),
});

export const target = rpcTarget({
    async serve(port) {
        const server = createHTTPServer({ router });
        await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
        return server;
    },
    async connect(port) {
        const client = createTRPCClient<typeof router>({ links: [httpLink({ url: `http://127.0.0.1:${port}` })] });
        return {
            add: (a, b) => client.add.query({ a, b }),
            saveUser: value => client.saveUser.mutate(value),
            listUsers: count => client.listUsers.query({ count }),
        };
    },
});
