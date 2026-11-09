// tRPC over HTTP with its standalone server. Arguments are validated with Zod, the usual setup.
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';

import { createUsers, rpcSuite } from './shared.js';

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

export default async function () {
    const server = createHTTPServer({ router });
    await new Promise<void>(resolve => server.listen(34573, '127.0.0.1', resolve));

    const client = createTRPCClient<typeof router>({ links: [httpLink({ url: 'http://127.0.0.1:34573' })] });

    return rpcSuite('tRPC', {
        add: (a, b) => client.add.query({ a, b }),
        saveUser: value => client.saveUser.mutate(value),
        listUsers: count => client.listUsers.query({ count }),
        close: () => void server.close(),
    });
}
