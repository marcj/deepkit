// Consumer smoke test: the published @deepkit packages, compiled with plain tsc, in a CJS or ESM project.
import { AutoIncrement, cast, entity, MinLength, PrimaryKey, ReflectionClass, ReflectionKind, serialize, typeOf, validate } from '@deepkit/type';
import { createTestingApp, OrmBrowserController } from '@deepkit/framework';
import { http, HttpRequest } from '@deepkit/http';
import { rpc } from '@deepkit/rpc';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { MongoDatabaseAdapter } from '@deepkit/mongo';

let failed = false;
function check(name: string, ok: boolean, detail: unknown = '') {
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== '' ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
    if (!ok) failed = true;
}

@entity.name('user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;
    constructor(public name: string & MinLength<3>) {
    }
}

interface Greeting {
    text: string;
    count: number;
}

function Page(props: { name: string }) {
    return <div class="greeting">Hello {props.name}</div>;
}

@http.controller()
class HttpController {
    @http.GET('/hello/:name')
    hello(name: string & MinLength<3>): Greeting {
        return { text: 'Hello ' + name, count: name.length };
    }

    @http.GET('/page')
    page() {
        return <Page name="World"/>;
    }
}

@rpc.controller('main')
class RpcController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    user(name: string): User {
        return new User(name);
    }
}

async function main() {
    // which build did the package exports resolve to? The stack of an error thrown inside @deepkit/type shows it.
    let resolved = '';
    try {
        cast<number>('not a number');
    } catch (error: any) {
        resolved = /@deepkit\/type\/(dist\/(cjs|esm))/.exec(error.stack)?.[1] || 'unknown';
    }
    console.log('module format:', typeof require !== 'undefined' ? 'cjs' : 'esm', '| @deepkit/type loaded from', resolved);

    // runtime types from the type-compiler
    const type = typeOf<Greeting>();
    check('typeOf', type.kind === ReflectionKind.objectLiteral, ReflectionKind[type.kind]);
    check('cast', cast<Greeting>({ text: 'a', count: '2' }).count === 2);
    check('validate', validate<User>({ id: 1, created: new Date, name: 'ab' }).length === 1);
    check('serialize', typeof serialize<User>(new User('Peter')).created === 'string');
    check('reflection', ReflectionClass.from(User).getProperty('name').type.kind === ReflectionKind.string);

    // mongo loads (no server needed to create the adapter)
    check('mongo', new MongoDatabaseAdapter('mongodb://localhost/test').getName() === 'mongo');

    // optional faker, loaded lazily by the ORM browser
    const fakerTypes = await new OrmBrowserController([]).getFakerTypes();
    check('faker', Object.keys(fakerTypes).length > 10, Object.keys(fakerTypes).length + ' types');

    // ORM with sqlite
    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [User]);
    await database.migrate();
    await database.persist(new User('Peter'), new User('Marie'));
    const users = await database.query(User).orderBy('name').find();
    check('orm', users.length === 2 && users[0] instanceof User && users[0].name === 'Marie', users.map(v => v.name));
    database.disconnect();

    // app + framework: HTTP and RPC in-process
    const testing = createTestingApp({ controllers: [HttpController, RpcController] });
    await testing.startServer();
    try {
        const hello = await testing.request(HttpRequest.GET('/hello/Peter'));
        check('http', hello.statusCode === 200 && hello.json.count === 5, hello.json);
        const invalid = await testing.request(HttpRequest.GET('/hello/ab'));
        check('http validation', invalid.statusCode === 400, invalid.statusCode);
        const page = await testing.request(HttpRequest.GET('/page'));
        check('jsx template', page.bodyString.includes('<div class="greeting">Hello World</div>'), page.bodyString);
        if (page.statusCode !== 200) for (const m of testing.getLogger().messages) if (m.level <= 3) console.log('  log:', m.message.slice(0, 500));

        const client = testing.createRpcClient();
        const controller = client.controller<RpcController>('main');
        check('rpc', await controller.add(2, 3) === 5);
        const user = await controller.user('Rpc');
        check('rpc class', user instanceof User && user.created instanceof Date);
        client.disconnect();
    } finally {
        await testing.stopServer(true);
    }

    process.exitCode = failed ? 1 : 0;
}

main();
