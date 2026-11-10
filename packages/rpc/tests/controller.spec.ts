import { expect, test } from '@jest/globals';
import { BehaviorSubject, Observable } from 'rxjs';

import { getClassName, sleep } from '@deepkit/core';
import { ProgressTracker } from '@deepkit/core-rxjs';
import { eventWatcher } from '@deepkit/event';
import { InjectorContext } from '@deepkit/injector';
import { Logger, MemoryLogger } from '@deepkit/logger';
import { Minimum, Positive, ReflectionClass, ReflectionKind, assertType, entity } from '@deepkit/type';

import { anyParametersType, createParameterSerializer } from '../src/action.js';
import { RpcControllerState } from '../src/client/action.js';
import { AsyncDirectClient, DirectClient, RpcDirectClientAdapter } from '../src/client/client-direct.js';
import { RpcClient } from '../src/client/client.js';
import { RpcController, getActions, rpc } from '../src/decorators.js';
import { onRpcAction, onRpcAuth, onRpcConnection, onRpcConnectionClose, onRpcControllerAccess } from '../src/events.js';
import { RpcKernel, RpcKernelConnection } from '../src/server/kernel.js';
import { Session, SessionState } from '../src/server/security.js';

test('default name', () => {
    @rpc.controller()
    class Controller {}

    const controller = new RpcController();

    controller.classType = Controller;

    expect(controller.getPath()).toBe('Controller');
});

test('decorator', async () => {
    @rpc.controller('name')
    class Controller {
        @rpc.action()
        action(): void {}

        @(rpc.action().group('a'))
        second(): void {}
    }

    {
        const actions = getActions(Controller);
        expect(actions.size).toBe(2);
        expect(actions.get('action')!.name).toBe('action');
        expect(actions.get('action')!.groups).toEqual([]);
        expect(actions.get('second')!.name).toBe('second');
        expect(actions.get('second')!.groups).toEqual(['a']);
    }
});

test('inheritance', async () => {
    class User {}

    @rpc.controller('name')
    class Controller {
        @rpc.action()
        action(): User | undefined {
            return new User();
        }

        @(rpc.action().group('a'))
        second(): User {
            return new User();
        }
    }

    @rpc.controller('different')
    class Extended extends Controller {
        @(rpc.action().group('extended'))
        second() {
            return super.second();
        }

        @(rpc.action().group('b'))
        third(): void {}
    }

    {
        const actions = getActions(Controller);
        expect(actions.size).toBe(2);
        expect(actions.get('action')!.name).toBe('action');
        expect(actions.get('action')!.groups).toEqual([]);
        expect(actions.get('second')!.name).toBe('second');
        expect(actions.get('second')!.groups).toEqual(['a']);

        const resultProperty = ReflectionClass.from(Controller).getMethod('action');
        const returnType = resultProperty.getReturnType();
        assertType(returnType, ReflectionKind.union);
        assertType(returnType.types[0], ReflectionKind.class);
        assertType(returnType.types[1], ReflectionKind.undefined);
        expect(returnType.types[0].classType).toBe(User);
    }

    {
        const actions = getActions(Extended);
        expect(actions.size).toBe(3);
        expect(actions.get('action')!.name).toBe('action');
        expect(actions.get('action')!.groups).toEqual([]);

        expect(actions.get('second')!.name).toBe('second');
        expect(actions.get('second')!.groups).toEqual(['a', 'extended']);

        expect(actions.get('third')!.name).toBe('third');
        expect(actions.get('third')!.groups).toEqual(['b']);

        const resultProperty = ReflectionClass.from(Extended).getMethod('action');
        const returnType = resultProperty.getReturnType();
        assertType(returnType, ReflectionKind.union);
        assertType(returnType.types[0], ReflectionKind.class);
        assertType(returnType.types[1], ReflectionKind.undefined);
        expect(returnType.types[0].classType).toBe(User);
    }
});

test('basics', async () => {
    @entity.name('model/basics')
    class MyModel {
        constructor(public name: string) {}
    }

    @entity.name('MyError')
    class MyError extends Error {}

    @entity.name('MyError2')
    class MyError2 extends Error {
        constructor(public id: number) {
            super('critical');
        }
    }

    @rpc.controller('myController')
    class Controller {
        @rpc.action()
        createModel(value: string): MyModel {
            return new MyModel(value);
        }

        @rpc.action()
        notDefined(): (string | number)[] {
            return [123, 'bar'];
        }

        @rpc.action()
        union(): string | number {
            return 213;
        }

        @rpc.action()
        throws(): void {
            throw new Error('Great');
        }

        @rpc.action()
        myError(): void {
            throw new MyError('Mhpf');
        }

        @rpc.action()
        myError2(): void {
            throw new MyError2(99);
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller);

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const m = await controller.createModel('foo');
        expect(m).toBeInstanceOf(MyModel);
        expect(m.name).toBe('foo');
    }

    {
        const m = await controller.notDefined();
        expect(m).toEqual([123, 'bar']);
    }

    {
        const m = await controller.union();
        expect(m).toBe(213);
    }

    {
        await expect(controller.throws()).rejects.toThrowError(Error as any);
        await expect(controller.throws()).rejects.toThrowError('Great');
    }

    {
        await expect(controller.myError()).rejects.toThrowError(MyError as any);
        await expect(controller.myError()).rejects.toThrowError('Mhpf');
    }

    {
        await expect(controller.myError2()).rejects.toThrowError(MyError2 as any);
        await expect(controller.myError2()).rejects.toThrowError('critical');
        await expect(controller.myError2()).rejects.toMatchObject({ id: 99 });
    }
});

test('parameters', async () => {
    class Controller {
        @rpc.action()
        get(value: string = 'nope'): string {
            return value;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const v = await controller.get('foo');
        expect(v).toBe('foo');
    }

    {
        const v = await controller.get();
        expect(v).toBe('nope');
    }
});

test('promise', async () => {
    @entity.name('model/promise')
    class MyModel {
        constructor(public name: string) {}
    }

    class Controller {
        @rpc.action()
        async createModel(value: string): Promise<MyModel> {
            return new MyModel(value);
        }

        @rpc.action()
        async createModel2(value: string): Promise<MyModel> {
            return new MyModel(value);
        }

        @rpc.action()
        async createModel3(value: string): Promise<MyModel> {
            return new MyModel(value);
        }

        @rpc.action()
        async createModel4(value: string): Promise<BehaviorSubject<MyModel>> {
            return new BehaviorSubject<MyModel>(new MyModel(value));
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const model = await controller.createModel('foo');
        expect(model).toBeInstanceOf(MyModel);
    }

    {
        const model = await controller.createModel('foo');
        expect(model).toBeInstanceOf(MyModel);
    }

    {
        const model = await controller.createModel2('foo');
        expect(model).toBeInstanceOf(MyModel);
    }

    {
        const model = await controller.createModel3('foo');
        expect(model).toBeInstanceOf(MyModel);
    }

    {
        const value = await controller.createModel4('foo');
        expect(value).toBeInstanceOf(BehaviorSubject);
        expect(value.value).toBeInstanceOf(MyModel);
    }
});

test('wrong arguments', async () => {
    @entity.name('model/promise2')
    class MyModel {
        constructor(public id: number) {}
    }

    class Controller {
        @rpc.action()
        async getProduct(id: number & Positive): Promise<MyModel> {
            return new MyModel(id);
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    await controller.getProduct(1);

    {
        await expect(controller.getProduct(undefined as any)).rejects.toThrow('args.id(type): Cannot convert undefined to number');
    }

    {
        await expect(controller.getProduct('23' as any)).rejects.toThrow('args.id(type): Cannot convert 23 to number');
    }

    {
        await expect(controller.getProduct(NaN as any)).rejects.toThrow('args.id(type): Cannot convert NaN to number');
    }

    {
        await expect(controller.getProduct(-1)).rejects.toThrow('id(positive): Number needs to be positive');
    }
});

test('di', async () => {
    class Controller {
        constructor(
            protected connection: RpcKernelConnection,
            protected sessionState: SessionState,
        ) {}

        @rpc.action()
        hasSession(): boolean {
            return this.sessionState.getSession() instanceof Session;
        }

        @rpc.action()
        hasConnection(): boolean {
            return this.connection instanceof RpcKernelConnection;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'test');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('test');

    expect(await controller.hasConnection()).toBe(true);
    expect(await controller.hasSession()).toBe(true);
});

test('connect disconnect', async () => {
    class Controller {
        constructor(protected connection: RpcKernelConnection) {}

        @rpc.action()
        test(): void {}

        @rpc.action()
        bye(): void {
            expect(this.connection.closed).toBe(false);
            this.connection.close();
            expect(this.connection.closed).toBe(true);
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    let triggered = 0;
    client.transporter.disconnected.subscribe(() => triggered++);

    expect(client.transporter.isConnected()).toBe(false);
    await client.connect();
    expect(client.transporter.isConnected()).toBe(true);
    await client.disconnect();
    expect(client.transporter.isConnected()).toBe(false);
    expect(triggered).toBe(1);

    await controller.test();
    expect(client.transporter.isConnected()).toBe(true);
    await client.disconnect();
    expect(client.transporter.isConnected()).toBe(false);
    expect(triggered).toBe(2);

    await controller.test();
    expect(client.transporter.isConnected()).toBe(true);
    await expect(controller.bye()).rejects.toThrow('Connection closed');
    expect(client.transporter.isConnected()).toBe(false);
    expect(triggered).toBe(3);

    await controller.test();
    expect(client.transporter.isConnected()).toBe(true);
});

test('types', async () => {
    @entity.name('types/model')
    class Model {}

    class Controller {
        @rpc.action()
        test(): { total: number; items: Model[] } {
            return { total: 5, items: [new Model()] };
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const res = await controller.test();
        expect(res.total).toBe(5);
        expect(res.items.length).toBe(1);
        expect(res.items[0]).toBeInstanceOf(Model);
    }
});

test('disable type reuse', async () => {
    //per default its tried to reuse models that have an entity name set. with disableTypeReuse this can be disabled

    @entity.name('type/reuse')
    class Model {
        child?: Model;

        constructor(public title: string) {}
    }

    class Controller {
        @rpc.action()
        test(): Model {
            return new Model('123');
        }

        @rpc.action()
        testDeep(): { total: number; items: Model[] } {
            return { total: 5, items: [new Model('123')] };
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    client.disableTypeReuse();
    const controller = client.controller<Controller>('myController');

    {
        const res = await controller.test();
        expect(res).not.toBeInstanceOf(Model);
        expect(res).toEqual({ title: '123' });
        expect(getClassName(res)).toBe('Model');
    }

    {
        const res = await controller.testDeep();
        expect(res.items[0]).not.toBeInstanceOf(Model);
        expect(res.items[0]).toEqual({ title: '123' });
    }
});

test('progress tracker', async () => {
    class Controller {
        progress = new ProgressTracker();
        tracker = this.progress.track('test', 10);

        @rpc.action()
        async getProgress(): Promise<ProgressTracker> {
            return this.progress;
        }

        @rpc.action()
        increase(): void {
            this.tracker.done++;
        }

        @rpc.action()
        done(): void {
            this.tracker.done = 10;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    client.disableTypeReuse();
    const controller = client.controller<Controller>('myController');

    {
        const res = await controller.getProgress();
        expect(res).toBeInstanceOf(ProgressTracker);
        expect(res.progress).toEqual(0);
        expect(res.done).toEqual(0);
        expect(res.total).toEqual(10);

        await controller.increase();
        await sleep(0.1);
        expect(res.done).toEqual(1);
        expect(res.total).toEqual(10);

        await controller.done();
        await sleep(0.1);
        expect(res.done).toEqual(10);
        expect(res.finished).toEqual(true);
        expect(res.total).toEqual(10);
    }
});

test('progress tracker stop', async () => {
    let stopCalled = false;

    class Controller {
        @rpc.action()
        async getProgress(): Promise<ProgressTracker> {
            const tracker = new ProgressTracker();
            const test1 = tracker.track('test1', 1000);

            const int = setInterval(() => {
                test1.done++;
            }, 10);

            test1.onStop(() => {
                stopCalled = true;
                clearInterval(int);
            });

            return tracker;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    client.disableTypeReuse();
    const controller = client.controller<Controller>('myController');

    {
        const res = await controller.getProgress();
        expect(res).toBeInstanceOf(ProgressTracker);
        expect(res.done).toEqual(0);
        expect(res.total).toEqual(1000);
        await sleep(0.1);
        expect(res.done).toBeGreaterThan(0);
        expect(res.done).toBeLessThan(50);
        res.stop();
        await sleep(0.1);
        expect(stopCalled).toBe(true);
        expect(res.done).toBeLessThan(50);
        expect(res.finished).toBe(false);
        expect(res.stopped).toBe(true);
        expect(res.ended).toBe(true);
    }
});

test('progress tracker reuse', async () => {
    class Controller {
        trackers = [new ProgressTracker()];

        constructor() {
            const track = this.trackers[0].track('test', 10);
            track.done = 5;
        }

        @rpc.action()
        getProgress(id: number): ProgressTracker | undefined {
            return this.trackers[id];
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');
    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const res = await controller.getProgress(0);
        expect(res).toBeInstanceOf(ProgressTracker);
        expect(res!.total).toBe(10);
        expect(res!.done).toBe(5);
    }

    {
        const res = await controller.getProgress(1);
        expect(res).toBe(undefined);
    }
});

test('missing types log warning', async () => {
    class Controller {
        @rpc.action()
        test() {
            return new Observable(observer => {
                observer.next(123);
                observer.complete();
            });
        }

        @rpc.action()
        test2(): Observable<any> {
            return new Observable(observer => {
                observer.next({ a: '123' });
                observer.complete();
            });
        }

        @rpc.action()
        test3(): Observable<string> {
            return new Observable(observer => {
                observer.next('abc');
                observer.complete();
            });
        }

        @rpc.action()
        test4() {
            return { a: '123' };
        }

        @rpc.action()
        test5(): { a: string } {
            return { a: '123' };
        }

        @rpc.action()
        test6() {
            return 123;
        }
    }

    const memoryLogger = new MemoryLogger();
    const kernel = new RpcKernel(undefined, memoryLogger);
    kernel.registerController(Controller, 'myController');
    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    const observable = await controller.test();
    expect(await observable.toPromise()).toBe(123);
    expect(memoryLogger.getOutput()).toContain('RPC action Controller.test returns an Observable, but no specific type');

    memoryLogger.clear();
    const observable2 = await controller.test2();
    expect(await observable2.toPromise()).toEqual({ a: '123' });
    expect(memoryLogger.getOutput()).toContain('RPC action Controller.test2 returns an Observable, but no specific type');

    memoryLogger.clear();
    const observable3 = await controller.test3();
    expect(await observable3.toPromise()).toBe('abc');
    expect(memoryLogger.getOutput()).not.toContain('RPC action Controller.test3 returns an Observable, but no specific type');

    memoryLogger.clear();
    const result = await controller.test4();
    expect(result).toEqual({ a: '123' });
    expect(memoryLogger.getOutput()).toContain('RPC action Controller.test4 returns an object, but no specific type');

    memoryLogger.clear();
    const result2 = await controller.test4();
    expect(result2).toEqual({ a: '123' });
    // does not log again
    expect(memoryLogger.getOutput()).not.toContain('RPC action Controller.test4 returns an object, but no specific type');

    memoryLogger.clear();
    const result3 = await controller.test5();
    expect(result3).toEqual({ a: '123' });
    expect(memoryLogger.getOutput()).not.toContain('RPC action Controller.test5 returns a number, but no specific type');

    memoryLogger.clear();
    const result4 = await controller.test6();
    expect(result4).toEqual(123);
    expect(memoryLogger.getOutput()).not.toContain('RPC action Controller.test5 returns a number, but no specific type');
});

test('validation errors', async () => {
    @rpc.logValidationErrors(true)
    class Controller {
        @(rpc.action().logValidationErrors(false))
        test1(value: number & Minimum<3>): any {
            return value;
        }

        @rpc.action()
        test2(value: number & Minimum<3>): any {
            return value;
        }

        @(rpc.action().logValidationErrors(true))
        test3(value: number & Minimum<3>): any {
            return value;
        }

        @rpc.action()
        test4(value: number): { a: string } {
            return 4 as any;
        }
    }

    const memoryLogger = new MemoryLogger();
    const kernel = new RpcKernel(undefined, memoryLogger);
    kernel.registerController(Controller, 'myController');
    const client = new DirectClient(kernel);

    const controller = client.controller<Controller>('myController');

    {
        memoryLogger.clear();
        await controller.test1(1).catch(() => true);
        expect(memoryLogger.getOutput()).not.toContain('Validation error for arguments of Controller.test');
    }

    {
        memoryLogger.clear();
        await controller.test2(1).catch(() => true);
        expect(memoryLogger.getOutput()).toContain('Validation error for arguments of Controller.test2');
    }

    {
        memoryLogger.clear();
        await controller.test3(1).catch(() => true);
        expect(memoryLogger.getOutput()).toContain('Validation error for arguments of Controller.test3');
    }

    {
        memoryLogger.clear();
        await controller.test4(1).catch(() => true);
        expect(memoryLogger.getOutput()).toContain('Action Controller.test4 return type serialization');
    }
});

test('disable strict serialization', async () => {
    @rpc.logValidationErrors(true)
    class Controller {
        constructor(protected logger: Logger) {}

        @rpc.action()
        test(): { value: string } {
            return 123 as any;
        }

        @(rpc.action().strictSerialization(false))
        test2(): { value: string } {
            return 123 as any;
        }

        @rpc.action()
        params1(value: { value: string }): void {
            this.logger.log(`Got ${value}`);
        }

        @(rpc.action().strictSerialization(false))
        params2(value: { value: string }): void {
            this.logger.log(`Got ${value}`);
        }
    }

    const memoryLogger = new MemoryLogger();
    const kernel = new RpcKernel(undefined, memoryLogger);
    kernel.registerController(Controller, 'myController');

    class DirectClient2 extends RpcClient {
        getActionClient() {
            return this.actionClient;
        }

        constructor(rpcKernel: RpcKernel, injector?: InjectorContext) {
            super(new RpcDirectClientAdapter(rpcKernel, injector));
        }
    }

    const client = new DirectClient2(kernel);

    const actionsClient = client.getActionClient();
    const state = new RpcControllerState('myController');

    {
        memoryLogger.clear();
        await expect(actionsClient.action(state, 'test', [])).rejects.toThrow('Cannot convert 123 to {value: string}');
    }

    {
        memoryLogger.clear();
        const res = await actionsClient.action(state, 'test2', []);
        expect(res).toBe(123);
    }

    {
        memoryLogger.clear();
        // simulate a malicious client that sends wrong data
        await actionsClient.loadActionTypes(state, 'params1');
        (state.getState('params1').fast as any).serialize = createParameterSerializer(anyParametersType);
        await expect(actionsClient.action(state, 'params1', [123])).rejects.toThrow('Validation error for arguments of Controller.params1');
        expect(memoryLogger.getOutput()).not.toContain('Got 123');
    }

    {
        memoryLogger.clear();
        const res = await actionsClient.action(state, 'params2', [123]);
        expect(memoryLogger.getOutput()).toContain('Got 123');
    }
});

test('Observable<Buffer>', async () => {
    class Controller {
        @rpc.action()
        test1(): Observable<Buffer> {
            return new Observable(observer => {
                observer.next(Buffer.from([1, 2, 3]));
                observer.complete();
            });
        }

        @rpc.action()
        test2(): Observable<Uint8Array> {
            return new Observable(observer => {
                observer.next(Buffer.from([1, 2, 3]));
                observer.complete();
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');
    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const res = await controller.test1();
        const buffer = await res.toPromise();
        expect(buffer).toBeUndefined();
    }
    {
        const res = await controller.test2();
        const buffer = await res.toPromise();
        expect(buffer).toBeInstanceOf(Uint8Array);
        expect(buffer!.toString()).toBe('1,2,3');
    }
});

test('events', async () => {
    class Controller {
        @rpc.action()
        async test1(): Promise<string> {
            await sleep(0.1);
            return 'test1';
        }

        @rpc.action()
        async test2(): Promise<void> {
            throw new Error('test2');
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');
    kernel.listen(onRpcAuth, event => {
        event.data.session = new Session('abc', event.data.token);
    });
    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    const watcher = eventWatcher(kernel.getEventDispatcher(), [onRpcConnection, onRpcAction, onRpcConnectionClose, onRpcControllerAccess, onRpcAuth]);

    await controller.test1();

    await client.disconnect();

    expect(watcher.messages).toEqual(['rpc.connection', 'rpc.action phase=start', 'rpc.controllerAccess phase=start', 'rpc.controllerAccess phase=success', 'rpc.action phase=success', 'rpc.connectionClose reason=closed']);

    expect(kernel.stats).toMatchObject({
        actions: 1,
        connections: 0,
        totalConnections: 1,
    });

    expect(watcher.get(onRpcAction, event => event.phase === 'success').timing).toEqual({
        start: expect.any(Number),
        end: expect.any(Number),
        types: expect.any(Number),
        parseBody: expect.any(Number),
        validate: expect.any(Number),
        controllerAccess: expect.any(Number),
    });

    client.token.set('abc');
    watcher.clear();
    await controller.test1();
    await client.disconnect();

    expect(watcher.messages).toEqual([
        'rpc.connection',
        'rpc.auth phase=start token=abc',
        'rpc.auth phase=success token=abc',
        'rpc.action phase=start',
        'rpc.controllerAccess phase=start',
        'rpc.controllerAccess phase=success',
        'rpc.action phase=success',
        'rpc.connectionClose reason=closed',
    ]);

    expect(kernel.stats).toMatchObject({
        actions: 2,
        connections: 0,
        totalConnections: 2,
    });
});

test('connection disconnect client', async () => {
    class Controller {
        @rpc.action()
        async action() {
            await sleep(0.1);
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');
    const client = new AsyncDirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    await client.connect();
    const promise = controller.action();
    await client.disconnect();
    await expect(promise).rejects.toThrow('Connection closed');
});

test('connection disconnect back-controller', async () => {
    class ClientController {
        @rpc.action()
        async action() {
            await sleep(0.1);
            return true;
        }
    }

    class ServerController {
        constructor(private connection: RpcKernelConnection) {}

        @rpc.action()
        async start() {
            return this.connection.controller<ClientController>('client').action();
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(ServerController, 'myController');
    const client = new DirectClient(kernel);
    const controller = client.controller<ServerController>('myController');

    await client.connect();
    await expect(controller.start()).rejects.toThrow('RpcClient has no controllers registered');

    client.registerController(ClientController, 'client');
    await expect(controller.start()).resolves.toBe(true);

    const promise = controller.start();
    await client.disconnect();
    await expect(promise).rejects.toThrow('Connection closed');
});
