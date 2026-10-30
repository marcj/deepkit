import { sleep } from '@deepkit/core';
import { entity } from '@deepkit/type';
import { expect, test } from '@jest/globals';
import { BehaviorSubject, defer, Observable, Subject, Subscription, switchMap, toArray } from 'rxjs';
import { first, take } from 'rxjs/operators';
import { DirectClient } from '../src/client/client-direct.js';
import { rpc } from '../src/decorators.js';
import { RpcKernel } from '../src/server/kernel.js';
import { createSubject } from '../src/utils.js';

test('observable basics', async () => {
    @entity.name('model')
    class MyModel {
        constructor(public name: string) {
        }
    }

    class Controller {
        @rpc.action()
        strings(): Observable<string> {
            return new Observable<string>((observer) => {
                observer.next('first');
                observer.next('second');
                observer.next('third');
                observer.complete();
            });
        }

        @rpc.action()
        errors(): Observable<string> {
            return new Observable<string>((observer) => {
                observer.error(new Error('Jupp'));
            });
        }

        @rpc.action()
        myModel(): Observable<MyModel> {
            return new Observable<MyModel>((observer) => {
                observer.next(new MyModel('Peter'));
                observer.complete();
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(Observable);

        const firstValue = await o.pipe(first()).toPromise();
        expect(firstValue).toBe('first');

        const secondValue = await o.pipe(take(2)).toPromise();
        expect(secondValue).toBe('second');

        const thirdValue = await o.pipe(take(3)).toPromise();
        expect(thirdValue).toBe('third');

        const lastValue = await o.toPromise();
        expect(lastValue).toBe('third');
    }

    {
        const o = await controller.errors();
        expect(o).toBeInstanceOf(Observable);
        await expect(o.toPromise()).rejects.toThrowError(Error as any);
        await expect(o.toPromise()).rejects.toThrowError('Jupp');
    }

    {
        const o = await controller.myModel();
        expect(o).toBeInstanceOf(Observable);
        const model = await o.toPromise();
        expect(model).toBeInstanceOf(MyModel);
        expect(model?.name).toBe('Peter');
    }

    {
        await expect((controller as any).unknownMethod()).rejects.toThrowError('Action unknown unknownMethod');
    }
});

test('Subject', async () => {
    class Controller {
        @rpc.action()
        strings(): Subject<string> {
            const subject = new Subject<string>();
            (async () => {
                await sleep(0.1);
                subject.next('first');
                subject.next('second');
                subject.complete();
            })();
            return subject;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(Subject);
        const lastValue = await o.toPromise();
        expect(lastValue).toBe('second');
    }
});

test('promise Subject', async () => {
    class Controller {
        @rpc.action()
        async strings(): Promise<Subject<string>> {
            const subject = new Subject<string>();
            (async () => {
                await sleep(0.1);
                subject.next('first');
                subject.next('second');
                subject.complete();
            })();
            return subject;
        }

        @rpc.action()
        async stringsExplicit(): Promise<Subject<string>> {
            const subject = new Subject<string>();
            (async () => {
                await sleep(0.1);
                subject.next('first');
                subject.next('second');
                subject.complete();
            })();
            return subject;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(Subject);
        const lastValue = await o.toPromise();
        expect(lastValue).toBe('second');
    }

    {
        const o = await controller.stringsExplicit();
        expect(o).toBeInstanceOf(Subject);
        const lastValue = await o.toPromise();
        expect(lastValue).toBe('second');
    }
});

test('subject not completes automatically when connection closes', async () => {
    const subject = new Subject<string>();

    class Controller {
        @rpc.action()
        strings(): Subject<string> {
            return subject;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(Subject);
        expect(subject.observed).toBe(true);
        o.unsubscribe();
        await sleep(0.1);
        expect(subject.closed).toBe(false);
        expect(subject.observed).toBe(false);
    }

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(Subject);
        expect(subject.observed).toBe(true);
        await client.disconnect();
        await sleep(0.1);
        expect(subject.closed).toBe(false);
        expect(subject.observed).toBe(false);
    }
});

test('subject redirect of global subject', async () => {
    const globalSubject = new Subject<string>();

    class Controller {
        @rpc.action()
        strings(): Subject<string> {
            return globalSubject;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(Subject);
        expect(globalSubject.isStopped).toBe(false);
        expect(globalSubject.observed).toBe(true);
        o.unsubscribe();
        await sleep(0);
        expect(globalSubject.observed).toBe(false);
        expect(globalSubject.isStopped).toBe(false);
    }
});

test('observable unsubscribes automatically when connection closes', async () => {
    let unsubscribed = false;

    class Controller {
        @rpc.action()
        strings(): Observable<string> {
            return new Observable((observer) => {
                return {
                    unsubscribe() {
                        unsubscribed = true;
                    },
                };
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = (await controller.strings()).subscribe(() => {
        });
        expect(o).toBeInstanceOf(Subscription);
        expect(unsubscribed).toBe(false);
        o.unsubscribe();
        await sleep(0);
        expect(unsubscribed).toBe(true);
    }

    {
        unsubscribed = false;
        const o = (await controller.strings()).subscribe(() => {
        });
        expect(o).toBeInstanceOf(Subscription);
        expect(unsubscribed).toBe(false);
        client.disconnect();
        await sleep(0);
        expect(unsubscribed).toBe(true);
    }
});

test('observable different next type', async () => {
    class WrongModel {
        id: number = 0;
    }

    @entity.name('observable/differentytype')
    class MyModel {
        id: number = 0;
    }

    class Controller {
        protected subject = new BehaviorSubject<MyModel | undefined>(undefined);

        @rpc.action()
        getSubject(): BehaviorSubject<MyModel | undefined> {
            if (this.subject) this.subject.complete();
            this.subject = new BehaviorSubject<MyModel | undefined>(undefined);
            return this.subject;
        }

        @rpc.action()
        triggerCorrect(): void {
            this.subject.next(Object.assign(new MyModel, { id: 2 }));
        }

        @rpc.action()
        triggerPlain(): void {
            this.subject.next({ id: 3 });
        }

        @rpc.action()
        triggerWrongModel(): void {
            this.subject.next(new WrongModel());
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const subject = await controller.getSubject();
        expect(subject.value).toBe(undefined);
        await controller.triggerCorrect();
        expect(subject.value).toBeInstanceOf(MyModel);
        expect(subject.value).toEqual({ id: 2 });
    }

    {
        const subject = await controller.getSubject();
        expect(subject.value).toBe(undefined);
        await controller.triggerPlain();
        expect(subject.value).toEqual({ id: 3 });
    }

    {
        const subject = await controller.getSubject();
        expect(subject.value).toBe(undefined);
        await controller.triggerWrongModel();
        expect(subject.value).toEqual({ id: 0 });
    }
});

test('Behavior', async () => {
    class Controller {
        @rpc.action()
        initial(): BehaviorSubject<string> {
            return new BehaviorSubject<string>('initial');
        }

        @rpc.action()
        strings(): BehaviorSubject<string> {
            const subject = new BehaviorSubject<string>('initial');
            (async () => {
                await sleep(0.1);
                subject.next('first');
                subject.next('second');
                subject.complete();
            })();
            return subject;
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.initial();
        expect(o).toBeInstanceOf(BehaviorSubject);
        expect(o.getValue()).toBe('initial');
    }

    {
        const o = await controller.strings();
        expect(o).toBeInstanceOf(BehaviorSubject);
        const lastValue = await o.toPromise();
        expect(lastValue).toBe('second');
    }
});

test('make sure base assumption about Subject is right', async () => {
    {
        const subject = new Subject<any>();
        let teardown = false;
        subject.subscribe().add(() => {
            teardown = true;
        });

        subject.unsubscribe();
        expect(teardown).toBe(false);
    }

    {
        const subject = new Subject<any>();
        let teardown = false;
        subject.subscribe().add(() => {
            teardown = true;
        });

        subject.complete();
        expect(teardown).toBe(true);
    }
});

test('observable complete', async () => {
    let active = false;

    class Controller {
        @rpc.action()
        numberGenerator(max: number): Observable<number> {
            return new Observable<number>((observer) => {
                let done = false;
                let i = 0;
                active = true;
                (async () => {
                    while (!done && i <= max) {
                        observer.next(i++);
                        await sleep(0.02);
                    }
                    active = false;
                    observer.complete();
                })();

                return {
                    unsubscribe() {
                        done = true;
                        active = false;
                    },
                };
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        //make sure the assumption that unsubscribe() is even called when the observer calls complete() himself.
        let unsubscribedCalled = false;
        const o = new Observable<number>((observer) => {
            unsubscribedCalled = false;
            observer.next(1);
            observer.complete();
            return {
                unsubscribe() {
                    unsubscribedCalled = true;
                },
            };
        });
        {
            const lastValue = await o.toPromise();
            expect(lastValue).toBe(1);
            expect(unsubscribedCalled).toBe(true);
        }

        {
            const lastValue = await new Promise((resolve) => {
                let l: any = undefined;
                o.subscribe((value) => {
                    l = value;
                }, () => {
                }, () => {
                    resolve(l);
                });
            });
            expect(lastValue).toBe(1);
            expect(unsubscribedCalled).toBe(true);
        }
    }

    {
        const o = await controller.numberGenerator(10);
        expect(o).toBeInstanceOf(Observable);
        const lastValue = await o.toPromise();
        expect(lastValue).toBe(10);
        expect(active).toBe(false);
    }

    {
        const o = await controller.numberGenerator(10000);
        expect(o).toBeInstanceOf(Observable);
        const complete = new BehaviorSubject(0);
        const sub = o.subscribe(complete);

        await sleep(0.1); //provide some time to generate some numbers
        expect(active).toBe(true);
        sub.unsubscribe(); //this calls unsubscribe() in the observer. We don't know when this happens from client PoV

        await sleep(0.01); //provide some time to handle it

        expect(active).toBe(false);
        expect(complete.value).toBeGreaterThan(1);
        expect(complete.value).toBeLessThan(10000);
    }
});

test('garbage collection', async () => {
    let teardowns = 0;

    class Controller {
        @rpc.action()
        async subscribeChats(name: string) {
            return createSubject<string>((subject) => {
                subject.next(name);
                subject.next('hello');
                subject.next('world');
            }, () => teardowns++);
        }

        @rpc.action()
        async subscribeChats2(name: string) {
            return new Observable<string>((subject) => {
                subject.next(name);
                subject.next('hello');
                subject.next('world');
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'main');
    const client = new DirectClient(kernel);
    await client.connect();
    const controller = client.controller<Controller>('main');

    async function test(callback: () => Promise<void>) {
        for (let i = 0; i < 100; i++) {
            await callback();
        }
        await sleep(0.1);
        (gc as any)();
        await sleep(0.1);
        (gc as any)();
        await sleep(0.1);
    }

    await test(async () => {
        const subject = await controller.subscribeChats('asd');
    });

    expect(kernel.stats.active.subjects).toBe(0);
    expect(kernel.stats.total.subjects).toBe(100);

    await test(async () => {
        const observable = await controller.subscribeChats2('asd');
    });
    expect(kernel.stats.active.observables).toBe(0);
    expect(kernel.stats.total.observables).toBe(100);

    await test(async () => {
        const observable = await controller.subscribeChats2('asd');
        const sub = observable.subscribe(() => {

        });
        sub.unsubscribe();
    });

    expect(kernel.stats.active.observables).toBe(0);
    expect(kernel.stats.total.observables).toBe(200);
    expect(kernel.stats.active.subscriptions).toBe(0);
    expect(kernel.stats.total.subscriptions).toBe(100);
});

test('instantObservable', async () => {
    let teardowns = 0;

    class Controller {
        @rpc.action()
        subscribeChats(channel: string) {
            return new Observable<string>((subject) => {
                subject.next(channel);
                subject.next('hello');
                subject.next('world');
                return () => teardowns++;
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');

    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    {
        const o = await controller.subscribeChats('a');
        expect(o).toBeInstanceOf(Observable);
        expect(teardowns).toBe(0);
        const values = await o.pipe(take(3), toArray()).toPromise();
        expect(teardowns).toBe(1);
        expect(values).toEqual(['a', 'hello', 'world']);
    }

    {
        expect(teardowns).toBe(1);
        const values = await defer(() => controller.subscribeChats('b')).pipe(switchMap(v => v), take(3), toArray()).toPromise();
        expect(values).toEqual(['b', 'hello', 'world']);
        expect(teardowns).toBe(2);
    }
});

test('Subject is not garbage collected while subscribed', async () => {
    class Controller {
        @rpc.action()
        strings(): Subject<string> {
            const subject = new Subject<string>();
            (async () => {
                await sleep(0.2);
                subject.next('first');
                subject.complete();
            })();
            return subject;
        }

        @rpc.action()
        observable(): Observable<string> {
            return new Observable(observer => {
                setTimeout(() => {
                    observer.next('first');
                    observer.complete();
                }, 200);
            });
        }
    }

    const kernel = new RpcKernel();
    kernel.registerController(Controller, 'myController');
    const client = new DirectClient(kernel);
    const controller = client.controller<Controller>('myController');

    // no reference to the Subject/Observable is kept, only to the promise
    const subjectPromise = (await controller.strings()).toPromise();
    const observablePromise = (await controller.observable()).toPromise();
    for (let i = 0; i < 5; i++) {
        (global as any).gc();
        await sleep(0.01);
    }

    expect(await subjectPromise).toBe('first');
    expect(await observablePromise).toBe('first');
});
