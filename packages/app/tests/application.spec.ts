import { beforeEach, expect, test } from '@jest/globals';
import { App, onAppError, onAppExecute, onAppExecuted, onAppShutdown } from '../src/app.js';
import { ClassType, getCurrentDirName, Inject, isClass } from '@deepkit/core';
import { ProviderWithScope, Token } from '@deepkit/injector';
import { AppModule, createModule, createModuleClass } from '../src/module.js';
import { BaseEvent, DataEvent, DataEventToken, EventDispatcher, eventDispatcher, EventOfEventToken, EventToken } from '@deepkit/event';
import { cli, Command, Flag } from '../src/command.js';
import { ControllerConfig, ServiceContainer } from '../src/service-container.js';

const dirname = getCurrentDirName();

Error.stackTraceLimit = 100;

class BaseConfig {
    db: string = 'notSet';
}

class BaseService {
    constructor(public db: BaseConfig['db']) {
    }
}

class BaseModule extends createModuleClass({ name: 'base', config: BaseConfig, providers: [BaseService] }) {
    root = true;
}

class Config {
    token: string = 'notSet';
}

class Service {
    constructor(public token: Config['token']) {
    }
}

beforeEach(() => {
    process.env = {};
});

test('loadConfigFromEnvVariables', async () => {
    process.env.APP_TOKEN = 'fromBefore';
    process.env.APP_BASE_DB = 'changed2';
    const app = new App({ config: Config, providers: [Service], imports: [new BaseModule] });
    app.loadConfigFromEnv();

    const service = app.get(Service);
    expect(service.token).toBe('fromBefore');

    const baseModule = app.serviceContainer.getModule(BaseModule);
    expect(baseModule.getConfig()).toEqual({ db: 'changed2' });

    const baseService = app.get(BaseService);
    expect(baseService.db).toBe('changed2');
});

test('loadConfigFromEnvVariables upper same', async () => {
    process.env.CC_PREVIEW_INTERNAL_KEY = 'abced';
    class Config {
        PREVIEW_INTERNAL_KEY: string = 'default';
    }

    class Service {
        constructor(public key: Config['PREVIEW_INTERNAL_KEY']) {
        }
    }

    const app = new App({ config: Config, providers: [Service] });
    app.loadConfigFromEnv({ prefix: 'CC_', namingStrategy: 'upper' });

    const service = app.get(Service);
    expect(service.key).toBe('abced');
});

test('loadConfigFromEnvFile', async () => {
    const app = new App({ config: Config, providers: [Service], imports: [new BaseModule] });
    app.loadConfigFromEnv({ envFilePath: dirname + '/test.env' });

    const service = app.get(Service);
    expect(service.token).toBe('changed5');

    const baseService = app.get(BaseService);
    expect(baseService.db).toBe('changed6');
});

test('loadConfigFromEnvVariable', async () => {
    process.env.APP_CONFIG = JSON.stringify({
        token: 'changed3',
        base: {
            db: 'changed4',
        },
    });
    const app = new App({ config: Config, providers: [Service], imports: [new BaseModule] });
    app.loadConfigFromEnvVariable('APP_CONFIG');

    const service = app.get(Service);
    expect(service.token).toBe('changed3');

    const baseService = app.get(BaseService);
    expect(baseService.db).toBe('changed4');
});

test('loadConfigFromEnvVariables non-root import', async () => {
    class BaseConfig {
        db: string = 'notSet';
    }

    class BaseService {
        constructor(public db: BaseConfig['db']) {
        }
    }

    const baseModule = new AppModule({}, { name: 'base', config: BaseConfig, providers: [BaseService] });
    const app = new App({ imports: [baseModule] });
    process.env.APP_BASE_DB = 'changed2';
    app.loadConfigFromEnv();

    const baseService = app.serviceContainer.getInjector(baseModule).get(BaseService);
    expect(baseService.db).toBe('changed2');
});

test('validation fails when setupConfig sets wrong values', async () => {
    class BaseConfig {
        log: boolean = false;
    }

    const baseModule = new AppModule<BaseConfig>({}, { config: BaseConfig, providers: [BaseService] })
        .setupConfig((module, config) => {
            (config as any).log = 'asda';
        })
        .setup((module, config) => {
            expect(config.log).toBe(true);
        })
    ;

    const app = new App({ imports: [baseModule] });
    expect(() => app.serviceContainer.process()).toThrow('log(type): Not a boolean');
});

test('validation fails when env is wrong', async () => {
    class BaseConfig {
        log: boolean = false;
    }

    const baseModule = new (createModuleClass({ config: BaseConfig, providers: [BaseService] }));
    baseModule
        .setup((module, config) => {
            if (!config.log) throw new Error('log needs to be true');
        })
    ;

    process.env['APP_log'] = 'asdf';

    const app = new App({ imports: [baseModule] });
    app.loadConfigFromEnv();
    expect(() => app.serviceContainer.process()).toThrow('log needs to be true');
});

test('required value can be set via env or setupConfig', async () => {
    class BaseConfig {
        log!: boolean;
    }

    class BaseModule extends createModuleClass({ name: 'base', config: BaseConfig }) {
        process() {
            if (!this.config.log) throw new Error('log needs to be true');
        }
    }

    {
        const app = new App({ imports: [new BaseModule()] });
        expect(() => app.serviceContainer.process()).toThrow('log(type): Not a boolean');
    }

    {
        const app = new App({
            imports: [new BaseModule({ log: true })],
        });
        app.serviceContainer.process();
    }

    {
        const app = new App({
            imports: [new BaseModule().setupConfig((module, config) => {
                config.log = true;
            })],
        });
        app.serviceContainer.process();
    }

    {
        process.env['APP_BASE_LOG'] = '1';
        const app = new App({ imports: [new BaseModule()] });
        app.loadConfigFromEnv();
        app.serviceContainer.process();
    }

    {
        //will be converted to false
        process.env['APP_BASE_LOG'] = 'asdf';

        const app = new App({ imports: [new BaseModule()] });
        app.loadConfigFromEnv();
        expect(() => app.serviceContainer.process()).toThrow('log needs to be true');
    }

    {
        process.env['APP_CONFIG'] = '{}';

        const app = new App({ imports: [new BaseModule()] });
        app.loadConfigFromEnvVariable('APP_CONFIG');
        expect(() => app.serviceContainer.process()).toThrow('log(type): Not a boolean');
    }

    {
        process.env['APP_CONFIG'] = '{"base": {"log": true}}';

        const app = new App({ imports: [new BaseModule()] });
        app.loadConfigFromEnvVariable('APP_CONFIG');
        app.serviceContainer.process();
    }
});

test('loadConfigFromEnvVariables() happens before setup() calls', async () => {
    class BaseConfig {
        log: boolean = false;
    }

    const baseModule = new AppModule<BaseConfig>({}, { name: 'base', config: BaseConfig })
        .setup((module, config) => {
            expect(config.log).toBe(true);
        });

    const app = new App({ imports: [baseModule] });
    process.env.APP_BASE_LOG = '1';
    app.loadConfigFromEnv();

    app.serviceContainer.process();
});

test('config uppercase naming strategy', async () => {
    class Config {
        dbHost!: string;
    }

    const app = new App({ config: Config }).setup((module, config) => {
        expect(config.dbHost).toBe('mongodb://localhost');
    });
    process.env.APP_DB_HOST = 'mongodb://localhost';
    app.loadConfigFromEnv();

    app.serviceContainer.process();
});

test('config lowercase naming strategy', async () => {
    class Config {
        dbHost!: string;
    }

    const app = new App({ config: Config }).setup((module, config) => {
        expect(config.dbHost).toBe('mongodb://localhost');
    });
    process.env.app_db_host = 'mongodb://localhost';
    app.loadConfigFromEnv({ namingStrategy: 'lower', prefix: 'app_' });

    app.serviceContainer.process();
});

test('loadConfigFromEnvVariable() happens before setup() calls', async () => {
    class BaseConfig {
        log: boolean = false;
    }

    const baseModule = createModule({ name: 'base', config: BaseConfig })
        .setup((module, config) => {
            expect(config.log).toBe(true);
        });

    {
        const app = new App({ imports: [baseModule] });
        process.env.APP_CONFIG = '{"base": {"log": true}}';
        app.loadConfigFromEnvVariable('APP_CONFIG');

        app.serviceContainer.process();
    }
});

test('non-forRoot module with class listeners works without exports', async () => {
    const myEvent = new EventToken('my-event');

    let executed = false;

    class Listener {
        @eventDispatcher.listen(myEvent)
        boostrap() {
            executed = true;
        }
    }

    const myModule = new AppModule({}, { listeners: [Listener] });
    const app = new App({ imports: [myModule] });
    await app.get(EventDispatcher).dispatch(myEvent, new BaseEvent());
    expect(executed).toBe(true);
});

test('listen() with dependencies', async () => {
    interface EventData {
        id: number;
    }

    const myEvent = new DataEventToken<EventData>('my-event');

    class MyService {
    }

    class MyConfig {
        environment: string = 'dev';
    }

    const gotEvents: number[] = [];
    const myModule = new AppModule({}, {
        config: MyConfig,
        providers: [MyService],
        listeners: [
            myEvent.listen((event, service: MyService, env: MyConfig['environment']) => {
                if (!(service instanceof MyService)) throw new Error('Got no service');
                expect(env).toBe('dev');
                gotEvents.push(event.data.id);
            }),
        ],
    });

    const app = new App({ imports: [myModule] });
    const dispatcher = app.get(EventDispatcher);

    await dispatcher.dispatch(myEvent, new DataEvent({ id: 2 }));
    await dispatcher.dispatch(myEvent, new DataEvent({ id: 3 }));

    expect(gotEvents).toEqual([2, 3]);
});

test('non-forRoot module with fn listeners works without exports', async () => {
    const myEvent = new EventToken('my-event');

    let executed = false;
    const myModule = new AppModule({}, {
        listeners: [myEvent.listen(() => {
            executed = true;
        })],
    });
    const app = new App({ imports: [myModule] });
    await app.get(EventDispatcher).dispatch(myEvent, new BaseEvent());
    expect(executed).toBe(true);
});

test('cli controllers in sub modules are in correct injector context', async () => {
    class MyService {
        doIt() {
            return 5;
        }
    }

    let created = 0;

    @cli.controller('test')
    class MyController implements Command {
        constructor(private service: MyService, protected yes: Inject<boolean, 'onlyInCLI'>) {
            created++;
        }

        execute(): number {
            if (!this.yes) return 10;
            return this.service.doIt();
        }
    }

    class MyModule extends createModuleClass({
        providers: [MyService, { provide: 'onlyInCLI', scope: 'cli', useValue: true }],
        controllers: [MyController],
    }) {
    }

    {
        const app = new App({ imports: [new MyModule] });

        {
            const res = await app.execute(['test']);
            expect(res).toBe(5);
            expect(created).toBe(1);
        }
        {
            const res = await app.execute(['test']);
            expect(res).toBe(5);
            expect(created).toBe(2);
        }

        expect(() => app.get(MyService)).toThrow(`Service 'MyService' not found`);
    }

    {
        const app = new App({
            imports: [new MyModule().setup((module) => {
                module.addProvider({ provide: 'onlyInCLI', scope: 'cli', useValue: false });
            })],
        });
        const res = await app.execute(['test']);
        expect(res).toBe(10);
    }
});

test('config deps and @inject() in FactoryProvider', async () => {
    class Config {
        host: string = '0.0.0.0';
    }

    class MyClass {
        constructor(public readonly host: string) {
        }
    }

    type MyClassConfig = Pick<Config, 'host'>;

    class Unknown {
    }

    const module = new AppModule({}, {
        config: Config,
        providers: [
            {
                provide: MyClass, useFactory(config: MyClassConfig) {
                    return new MyClass(config.host);
                },
            },
            {
                provide: 'configHost', useFactory(host: Config['host']) {
                    return host;
                },
            },
        ],
    });

    {
        const app = App.fromModule(module);
        expect(app.get(MyClass).host).toBe('0.0.0.0');

        expect(app.get('configHost')).toEqual('0.0.0.0');
    }

    {
        const module = new AppModule({}, {
            providers: [
                {
                    provide: 'undefinedDep', useFactory(host: string) {
                        return host;
                    },
                },
            ],
        });
        const app = App.fromModule(module);
        expect(() => app.get('undefinedDep')).toThrow(`Undefined dependency "host: string" of useFactory(?). Type has no provider`);
    }
});


test('service container hooks', () => {
    class MyModule extends createModuleClass({}) {
        providersFound: ProviderWithScope[] = [];
        controllersFound: ClassType[] = [];

        processController(module: AppModule, config: ControllerConfig) {
            const controller = config.controller;
            if (!controller) return;
            expect(module).toBeInstanceOf(AppModule);
            expect(isClass(controller)).toBe(true);
            module.addProvider(controller);
            this.controllersFound.push(controller);
        }

        processProvider(module: AppModule, token: Token, provider: ProviderWithScope) {
            expect(module).toBeInstanceOf(AppModule);
            if (isClass(provider)) {
                debugger;
            }
            this.providersFound.push(provider);
        }
    }

    {
        const m = new MyModule;
        const app = new ServiceContainer(new AppModule({}, { imports: [m] }));
        app.process();
        expect(m.providersFound.length).toBe(9); //9 is the default, as the ServiceContainer adds default services
        expect(m.controllersFound.length).toBe(0);
    }

    {
        class Controller {
        }

        const m = new MyModule;
        const app = new ServiceContainer(new AppModule({}, { controllers: [Controller], imports: [m] }));
        app.process();
        expect(m.providersFound.length).toBe(10);
        expect(m.controllersFound.length).toBe(1);
    }

    {
        class Controller {
        }

        const m = new MyModule;
        const app = new ServiceContainer(new AppModule({}, { providers: [Controller], imports: [m] }));
        app.process();
        expect(m.providersFound.length).toBe(10);
        expect(m.controllersFound.length).toBe(0);
    }

    {
        class Controller {
        }

        class Service {
        }

        const baseModule = new AppModule({}, {
            controllers: [Controller],
            providers: [Service],
        });

        const m = new MyModule;
        const app = new ServiceContainer(new AppModule({}, { imports: [baseModule, m] }));
        app.process();
        expect(m.providersFound.length).toBe(11);
        expect(m.controllersFound.length).toBe(1);
    }
});

test('App.get generic', () => {
    interface Service {
        add(): void;
    }

    const app = new App({
        providers: [{
            provide: 'service', useClass: class {
                add() {
                }
            },
        }],
    });

    const service = app.get<Service>('service' as any);
    service.add();
});

test('event dispatch', () => {
    interface User {
        username: string;
    }


    class Logger {
        buffer: string[][] = [];

        log(...message: string[]) {
            console.log(...message);
            this.buffer.push(message);
        }
    }

    const app = new App({
        providers: [Logger],
    });

    const UserAddedEvent = new EventToken<DataEvent<User>>('user-added');

    app.listen(UserAddedEvent, (event, logger: Logger) => {
        logger.log('User added', event.data.username);
    });
    app.dispatch(UserAddedEvent, { username: 'Peter' });

    expect(app.get(Logger).buffer).toEqual([['User added', 'Peter']]);
});

test('command callback', async () => {
    class MyService {
    }

    const app = new App({
        providers: [MyService],
    }).command('test', (id: number, check: boolean & Flag = false, service: MyService) => {
        expect(id).toBe(34);
        expect(check).toBe(true);
        expect(service).toBeInstanceOf(MyService);
    });

    const res = await app.execute(['test', '34', '--check']);
});

test('command callback array', async () => {
    class MyService {
    }

    const app = new App({
        providers: [MyService],
    }).command('test', (id: number, check: number[] & Flag, service: MyService) => {
        expect(id).toBe(34);
        expect(check).toEqual([1, 2]);
        expect(service).toBeInstanceOf(MyService);
    });

    const res = await app.execute(['test', '34', '--check', '1', '--check', '2']);
});

test('events', async () => {
    class MyService {
    }

    let executeEvent: EventOfEventToken<typeof onAppExecute> | undefined = undefined;
    let executedEvent: EventOfEventToken<typeof onAppExecuted> | undefined = undefined;
    let errorEvent: EventOfEventToken<typeof onAppError> | undefined = undefined;
    let shutdownEvent: EventOfEventToken<typeof onAppShutdown> | undefined = undefined;

    const app = new App({
            providers: [MyService],
        })
            .command('test', (id: number, check: boolean & Flag = false) => {
                if (id === 404) throw new Error('error');
            })
            .listen(onAppExecute, (event) => {
                executeEvent = event.data;
            })
            .listen(onAppExecuted, (event) => {
                executedEvent = event.data;
            })
            .listen(onAppError, (event) => {
                errorEvent = event.data;
            })
            .listen(onAppShutdown, (event) => {
                shutdownEvent = event.data;
            })
    ;

    {
        executeEvent = undefined;
        executedEvent = undefined;
        errorEvent = undefined;
        shutdownEvent = undefined;

        const res = await app.execute(['test', '34', '--check']);
        expect(executeEvent!.command).toBe('test');
        expect(executeEvent!.parameters).toEqual({ id: 34, check: true });

        expect(executedEvent!.command).toBe('test');
        expect(executedEvent!.parameters).toEqual({ id: 34, check: true });
        expect(executedEvent!.exitCode).toEqual(0);

        expect(errorEvent).toBe(undefined);

        expect(shutdownEvent!.command).toBe('test');
        expect(shutdownEvent!.parameters).toEqual({ id: 34, check: true });
    }

    {
        executeEvent = undefined;
        executedEvent = undefined;
        errorEvent = undefined;
        shutdownEvent = undefined;

        const res = await app.execute(['test', '404', '--check']);
        expect(executeEvent!.command).toBe('test');
        expect(executeEvent!.parameters).toEqual({ id: 404, check: true });

        expect(executedEvent).toBe(undefined);

        expect(errorEvent!.command).toBe('test');
        expect(errorEvent!.parameters).toEqual({ id: 404, check: true });

        expect(shutdownEvent!.command).toBe('test');
        expect(shutdownEvent!.parameters).toEqual({ id: 404, check: true });
    }
});

test('config injection into listener empty', async () => {
    class Config {
        host: string = '';
    }

    function registerHost(event: any, host: Config['host']) {
        expect(host).toBe('');
    }

    const app = new App({
        config: Config,
    });

    app.listen(onAppExecute, registerHost);

    app.command('test', () => {
        return 1;
    });

    const res = await app.execute(['test']);
    expect(res).toBe(1);
});

test('config injection into listener configured', async () => {
    class Config {
        host: string = '';
    }

    function registerHost(event: any, host: Config['host']) {
        expect(host).toBe('localhost');
    }

    const app = new App({
        config: Config,
    }).configure({ host: 'localhost' });

    app.listen(onAppExecute, registerHost);

    app.command('test', () => {
        return 1;
    });

    const res = await app.execute(['test']);
    expect(res).toBe(1);
});

test('flag property keeps its default when not given', async () => {
    // Flag properties were set to undefined when the flag was not passed, so e.g. `path: string[] & Flag = []`
    // was undefined in execute() and migration:pending crashed with "Cannot read properties of undefined".
    let paths: string[] | undefined;
    let name: string | undefined;

    @cli.controller('test')
    class TestCommand {
        protected paths: string[] & Flag = [];
        protected name: string & Flag = 'default';

        execute() {
            paths = this.paths;
            name = this.name;
        }
    }

    const app = new App({ controllers: [TestCommand] });
    expect(await app.execute(['test'])).toBe(0);
    expect(paths).toEqual([]);
    expect(name).toBe('default');

    expect(await app.execute(['test', '--paths', 'a.ts', '--name', 'given'])).toBe(0);
    expect(paths).toEqual(['a.ts']);
    expect(name).toBe('given');

    // each execution gets a new command instance, so given flags don't leak into the next one
    expect(await app.execute(['test'])).toBe(0);
    expect(paths).toEqual([]);
    expect(name).toBe('default');
});
