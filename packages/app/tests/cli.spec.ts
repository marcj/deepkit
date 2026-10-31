import { expect, test } from '@jest/globals';
import { executeCommand, Flag, parseCliArgs, ParsedCliControllerConfig } from '../src/command.js';
import { EventDispatcher } from '@deepkit/event';
import { InjectorContext, InjectorModule } from '@deepkit/injector';
import { Logger, MemoryLogger } from '@deepkit/logger';
import { Stopwatch } from '@deepkit/stopwatch';
import { PrimaryKey, Reference } from '@deepkit/type';

test('parser', async () => {
    expect(parseCliArgs(['--id 1', '--id 2'])).toEqual({ id: ['1', '2'] });

    expect(parseCliArgs(['--help'])).toEqual({ help: true });
    expect(parseCliArgs(['1234', '--help'])).toEqual({ '@': ['1234'], help: true });
    expect(parseCliArgs(['1234', '--help', '--verbose'])).toEqual({ '@': ['1234'], help: true, verbose: true });

    expect(parseCliArgs(['1234', 'abc', '--id', '1'])).toEqual({ '@': ['1234', 'abc'], id: '1' });
    expect(parseCliArgs(['1234', 'abc', '--id 1'])).toEqual({ '@': ['1234', 'abc'], id: '1' });
    expect(parseCliArgs(['1234', 'abc', '--id 1', '--id 2'])).toEqual({ '@': ['1234', 'abc'], id: ['1', '2'] });
});

function builder(module: InjectorModule, commands: (ParsedCliControllerConfig | Function)[]) {
    const logger = new MemoryLogger();
    const eventDispatcher = new EventDispatcher();
    const rootModule: InjectorModule = new InjectorModule([
        { provide: Logger, useValue: logger },
        { provide: EventDispatcher, useValue: eventDispatcher },
        { provide: InjectorContext, useFactory: () => injector },
        { provide: Stopwatch, useValue: new Stopwatch },
    ]);
    module.setParent(rootModule);

    const injector = new InjectorContext(rootModule);
    const writer = (...messages: any) => logger.log(...messages);

    const mappedCommands: ParsedCliControllerConfig[] = [];
    for (const command of commands) {
        if (typeof command === 'function') {
            mappedCommands.push({ module, name: '', description: '', callback: command });
        } else {
            mappedCommands.push(command);
        }
    }

    const exec = async (bin: string[], args: string[]) => {
        const res = await executeCommand('node app.ts', args, eventDispatcher, logger, injector, mappedCommands, writer);
        return {
            exitCode: res,
            logger,
        };
    };

    return { exec, logger };
}

function simpleApp(commands: Function[]) {
    const module = new InjectorModule();
    const build = builder(module, commands);
    return async (args: string[]) => {
        build.logger.memory.clear();
        const res = await build.exec(['node', 'cli.js'], args);
        return { code: res.exitCode, output: res.logger.getOutput() };
    };
}

test('executeCommand 1', async () => {
    const app = simpleApp([
        function test(name: string, logger: Logger) {
            logger.log('Hello', name);
        },
        function test2(name: string, country: string, logger: Logger) {
            logger.log(`Hello ${name} from ${country}!`);
        },
        function addUser(username: string, group: number & Flag, logger: Logger) {
            logger.log(`Added user ${username} to group ${group}`);
        },
        function delUserById(id: number, logger: Logger) {
            logger.log(`Deleted user ${id}`);
        },
        /**
         * @description Wild system command.
         */
        function system_test(logger: Logger) {
            logger.log('system_test');
        },
    ]);

    const helpMessageRoot = `USAGE
  $ node app.ts [COMMAND]

COMMANDS
  add-user
  del-user-by-id
  test
  test2
system
  system:test     Wild system command.

For more information on a specific command or topic, type '[command/topic] --help'`;

    expect(await app([])).toEqual({ code: 0, output: helpMessageRoot });

    expect(await app(['system'])).toEqual({
        code: 0, output: `USAGE
  $ node app.ts system:[COMMAND]

COMMANDS
system
  system:test  Wild system command.

For more information on a specific command or topic, type '[command/topic] --help'`,
    });

    expect(await app(['test', 'Peter'])).toEqual({ code: 0, output: 'Hello Peter' });
    expect(await app(['test2', 'Peter', 'Germany'])).toEqual({ code: 0, output: 'Hello Peter from Germany!' });
    expect(await app(['add-user', 'Peter', '--group', '2'])).toEqual({ code: 0, output: 'Added user Peter to group 2' });

    const res1 = await app(['add-user', 'Peter', '--group', 'invalid']);
    expect(res1.output).toContain('Invalid value for option --group: invalid');
    expect(res1.code).toBe(1);

    expect(await app(['del-user-by-id', '123'])).toEqual({ code: 0, output: 'Deleted user 123' });
    expect((await app(['del-user-by-id', 'invalid'])).output).toContain('Invalid value for argument id: invalid. Cannot convert invalid to number');
});

test('executeCommand 2', async () => {
    const app = simpleApp([
        function showUser(name: string, detail: boolean = false, logger: Logger) {
            logger.log(`showUser ${name} ${detail}`);
        },
        function showUser2(name: string, view: Flag & ('default' | 'json') = 'default', logger: Logger) {
            logger.log(`showUser2 ${name} ${view}`);
        },
        function showUsers(user: string[] & Flag, logger: Logger) {
            logger.log(`showUsers ${user}`);
        },
    ]);

    expect(await app(['show-user', 'Peter'])).toEqual({ code: 0, output: 'showUser Peter false' });
    expect(await app(['show-user', 'Peter', '--detail'])).toEqual({ code: 0, output: 'showUser Peter true' });

    expect(await app(['show-user2', 'Peter'])).toEqual({ code: 0, output: 'showUser2 Peter default' });
    expect(await app(['show-user2', 'Peter', '--view', 'json'])).toEqual({ code: 0, output: 'showUser2 Peter json' });
    expect((await app(['show-user2', 'Peter', '--view', 'invalid'])).output).toContain(`Invalid value for option --view: invalid. Expected 'default' | 'json'`);

    expect(await app(['show-users', '--user', 'Peter'])).toEqual({ code: 0, output: 'showUsers Peter' });
    expect(await app(['show-users', '--user', 'Peter', '--user', 'John'])).toEqual({ code: 0, output: 'showUsers Peter,John' });
});

test('executeCommand 3', async () => {
    const app = simpleApp([
        function showUser(name: string & Flag<{ char: 'n' }>, logger: Logger) {
            logger.log(`showUser ${name}`);
        },
    ]);

    expect(await app(['show-user', '--name', 'Peter'])).toEqual({ code: 0, output: 'showUser Peter' });
    expect(await app(['show-user', '-n', 'Peter'])).toEqual({ code: 0, output: 'showUser Peter' });
    expect((await app(['show-user', '--help'])).output).toContain('-n, --name');
});

test('object literal flag', async () => {
    interface Options {
        name: string;
        age?: number;
    }

    const app = simpleApp([
        function showUser(options: Options & Flag, logger: Logger) {
            logger.log(`name=${options.name} age=${options.age}`);
        },
    ]);

    expect(await app(['show-user', '--name', 'Peter'])).toEqual({ code: 0, output: 'name=Peter age=undefined' });
    expect(await app(['show-user', '--name', 'Peter', '--age', '32'])).toEqual({ code: 0, output: 'name=Peter age=32' });
});


test('multiple object literal flag', async () => {
    interface Options {
        name: string;
        age?: number;
    }

    interface Options2 {
        user: string;
        created?: Date;
    }

    const app = simpleApp([
        function showUser(options: Options & Flag, options2: Options2 & Flag, logger: Logger) {
            logger.log(`name=${options.name} age=${options.age} user=${options2.user} created=${options2.created?.toJSON()}`);
        },
    ]);

    expect((await app(['show-user', '--name', 'Peter'])).output).toContain('Invalid value for option --user: undefined');
    expect(await app(['show-user', '--name', 'Peter', '--user', 'pete'])).toEqual({ code: 0, output: 'name=Peter age=undefined user=pete created=undefined' });
    expect(await app(['show-user', '--name', 'Peter', '--user', 'pete', '--created', '2021-01-01'])).toEqual({
        code: 0,
        output: 'name=Peter age=undefined user=pete created=2021-01-01T00:00:00.000Z',
    });
});


test('multiple object literal flag duplicate', async () => {
    interface Options {
        name: string;
        age?: number;
    }

    interface Options2 {
        name: number;
    }

    const app = simpleApp([
        function showUser(options: Options & Flag, options2: Options2 & Flag, logger: Logger) {
        },
        function showUser2(options: Options & Flag, options2: Options2 & Flag<{ prefix: '2' }>, logger: Logger) {
            logger.log(`name=${options.name} age=${options.age} name2=${options2.name}`);
        },
    ]);

    expect((await app(['show-user', '--name', 'Peter'])).output).toContain('Duplicate CLI');
    expect((await app(['show-user2', '--name', 'Peter', '--2.name', '3'])).output).toContain('name=Peter age=undefined name2=3');
    expect((await app(['show-user2', '--name', 'Peter', '--2.name', 'abc'])).output).toContain('Invalid value for option --2.name: abc');
});

test('object reference', async () => {
    class Account {
        id: number & PrimaryKey = 0;
    }

    class Options {
        constructor(public account: Account & Reference) {}
    }

    const app = simpleApp([
        function showUser(options: Options & Flag, logger: Logger) {
            logger.log(`account=${options.account.id}`);
        },
    ]);

    expect((await app(['show-user', '--account', '123'])).output).toContain('account=123');
    expect((await app(['show-user', '--help'])).output).toContain('--account number [required]');
});


test('class option with defaults', async () => {
    class Options {
        public name: string = 'Peter';
        exclude?: string[];
    }

    const app = simpleApp([
        function showUser(options: Options & Flag, logger: Logger) {
            logger.log(`name=${options.name}, exclude=${options.exclude}`);
        },
    ]);

    expect((await app(['show-user', '--name', 'John'])).output).toContain('name=John');
    expect((await app(['show-user', '--help'])).output).toContain('--exclude string [multiple]');
    expect((await app(['show-user'])).output).toContain('name=Peter, exclude=undefined');
    expect((await app(['show-user', '--exclude', 'a', '--exclude', 'b'])).output).toContain('name=Peter, exclude=a,b');
});

test('optional unknown provider', async () => {
    class Subject {}

    const app = simpleApp([
        function test(logger: Logger, options?: Subject) {
            logger.log(`Test`);
        },
    ]);

    expect((await app(['test'])).output).toContain('Test');
});
