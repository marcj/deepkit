import { afterEach, describe, expect, it, jest, test } from '@jest/globals';

import { App } from '@deepkit/app';
import { sleep } from '@deepkit/core';
import { HttpRequest, http } from '@deepkit/http';
import { InjectorContext } from '@deepkit/injector';
import { ConsoleTransport, Logger, MemoryLoggerTransport } from '@deepkit/logger';
import { rpc } from '@deepkit/rpc';

import { ApplicationServer } from '../src/application-server.js';
import { FrameworkModule } from '../src/module.js';
import { createTestingApp } from '../src/testing.js';
import { RpcServer, RpcServerInterface, WebWorker } from '../src/worker.js';

jest.mock('ws', () => {
    const on = jest.fn();
    const Server = jest.fn(() => ({
        on,
        close: jest.fn(),
    }));
    return {
        Server,
    };
});

Error.stackTraceLimit = 50;

jest.mock('http', () => ({
    ...(jest.requireActual('http') as any),
    Server: jest.fn(() => ({
        on: jest.fn(),
        listen: jest.fn(),
        close: jest.fn(),
        // start() waits for a server to listen
        listening: true,
    })),
}));

describe('application-server', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('testing app api', async () => {
        @rpc.controller('test')
        class MyController {
            constructor(protected logger: Logger) {}

            @rpc.action()
            foo() {
                this.logger.log('bar');
                return 'bar';
            }
        }

        const testing = createTestingApp({ controllers: [MyController] });
        await testing.startServer();

        const client = testing.createRpcClient();
        const controller = client.controller<MyController>('test');

        expect(await controller.foo()).toBe('bar');
        expect(testing.app.get(MemoryLoggerTransport).messageStrings.includes('bar'));
        await testing.stopServer();
    });

    test('basic controller', async () => {
        let createdControllers = 0;

        @rpc.controller('test')
        class MyController {
            constructor() {
                createdControllers++;
            }

            @rpc.action()
            foo() {
                return 'bar';
            }
        }

        const app = createTestingApp({
            controllers: [MyController],
            imports: [
                new FrameworkModule({
                    broker: { startOnBootstrap: false },
                }),
            ],
        }).app;
        const applicationServer = app.get(ApplicationServer);
        const injectorContext = app.get(InjectorContext);
        const controller = injectorContext.createChildScope('rpc').get(MyController);
        expect(controller.foo()).toBe('bar');

        createdControllers = 0;

        expect(createdControllers).toBe(0);

        await applicationServer.start();

        {
            const client = applicationServer.createClient();

            const controller = client.controller<MyController>('test');
            const a = await controller.foo();
            expect(a).toBe('bar');
            expect(createdControllers).toBe(1);
            client.disconnect();
        }

        {
            const client = applicationServer.createClient();

            const controller = client.controller<MyController>('test');
            const a = await controller.foo();
            expect(a).toBe('bar');
            expect(createdControllers).toBe(2);
            client.disconnect();
        }

        await applicationServer.close();
    });

    describe('http worker', () => {
        test('needed for publicDir', async () => {
            const testing = createTestingApp({
                controllers: [],
                imports: [new FrameworkModule({ publicDir: 'public' })],
            });

            await testing.startServer();
            const applicationServer = testing.app.get(ApplicationServer);
            expect(applicationServer.getWorker()).toBeInstanceOf(WebWorker);
            await testing.stopServer();
        });

        test('graceful shutdown succeeds', async () => {
            class MyController {
                @http.GET()
                async get() {
                    await sleep(0.2);
                    return 'wait-for-me';
                }
            }

            const testing = createTestingApp({
                controllers: [MyController],
                imports: [new FrameworkModule({ publicDir: 'public', gracefulShutdownTimeout: 1 })],
            });

            await testing.startServer();
            const request1 = testing.request(HttpRequest.GET('/'));
            await testing.stopServer(true);
            expect(testing.getLogger().messages.some(v => v.message.includes('Waiting 1s for all 1'))).toBe(true);
            expect(testing.getLogger().messages.some(v => v.message.includes('Timeout of 1s exceeded'))).toBe(false);
            expect((await request1).json).toBe('wait-for-me');
        });

        test('graceful shutdown fails', async () => {
            class MyController {
                @http.GET()
                async get() {
                    await sleep(1.2);
                    return 'wait-for-me';
                }
            }

            const testing = createTestingApp({
                controllers: [MyController],
                imports: [new FrameworkModule({ publicDir: 'public', gracefulShutdownTimeout: 1 })],
            });

            await testing.startServer();
            const request1 = testing.request(HttpRequest.GET('/'));
            await testing.stopServer(true);
            expect(testing.getLogger().messages.some(v => v.message.includes('Waiting 1s for all 1'))).toBe(true);
            expect(testing.getLogger().messages.some(v => v.message.includes('Timeout of 1s exceeded'))).toBe(true);
        });

        test('not needed without controllers or publicDir', async () => {
            const testing = createTestingApp({
                controllers: [],
            });

            await testing.startServer();
            const applicationServer = testing.app.get(ApplicationServer);
            expect(() => applicationServer.getWorker()).toThrow();
            await testing.stopServer();
        });
    });

    describe('RpcServer', () => {
        test('should use custom implementation when provided', async () => {
            const onMock = jest.fn();
            const wsServerMock = {
                on: onMock,
            };

            const rpcServerMock: RpcServerInterface = {
                start: jest.fn((options: any, createRpcConnection: any) =>
                    wsServerMock.on('connection', (ws: any, req: HttpRequest) => {
                        createRpcConnection({
                            close: jest.fn(),
                            bufferedAmount: jest.fn(),
                            clientAddress: jest.fn(),
                        });
                    }),
                ),
            };

            @rpc.controller('test')
            class MyController {}

            const app = new App({
                controllers: [MyController],
                providers: [
                    {
                        provide: RpcServer,
                        useValue: rpcServerMock,
                    },
                ],
                imports: [
                    new FrameworkModule({
                        broker: { startOnBootstrap: false },
                    }),
                ],
            });
            const applicationServer = app.get(ApplicationServer);
            await applicationServer.start();

            expect(rpcServerMock.start).toHaveBeenCalledTimes(1);
            expect(onMock).toHaveBeenCalledTimes(1);
            expect(require('ws').Server).not.toHaveBeenCalled();
            expect(new (require('ws').Server)().on).not.toHaveBeenCalled();

            await applicationServer.close();
        });

        test('should use default implementation via ws when not specified', async () => {
            @rpc.controller('test')
            class MyController {}

            const app = new App({
                controllers: [MyController],
                imports: [
                    new FrameworkModule({
                        broker: { startOnBootstrap: false },
                    }),
                ],
            });
            const applicationServer = app.get(ApplicationServer);
            await applicationServer.start();

            expect(require('ws').Server).toHaveBeenCalledTimes(1);
            expect(new (require('ws').Server)().on).toHaveBeenCalledWith('connection', expect.any(Function));

            await applicationServer.close();
        });
    });
});

describe('createTestingApp', () => {
    it('should setup the logger correctly', async () => {
        const loggerRemoveTransportSpy = jest.spyOn(Logger.prototype, 'removeTransport');
        const loggerAddTransportSpy = jest.spyOn(Logger.prototype, 'addTransport');
        const facade = createTestingApp({});
        await facade.startServer();
        expect(loggerAddTransportSpy).toHaveBeenCalledWith(expect.any(MemoryLoggerTransport));
        expect(loggerRemoveTransportSpy).toHaveBeenCalledWith(expect.any(ConsoleTransport));
    });
});
