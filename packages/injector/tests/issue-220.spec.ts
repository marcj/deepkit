import { expect, test } from '@jest/globals';

import { Mutex } from '@deepkit/core';
import { ReflectionKind, reflect } from '@deepkit/type';

import { InjectorContext } from '../src/injector.js';
import { InjectorModule } from '../src/module.js';
import { provide } from '../src/provider.js';
import { Consumer } from './issue-220/consumer.js';
import { Mutex as ReExported } from './issue-220/lib.js';

//https://github.com/marcj/deepkit/issues/220
test('a class re-exported with export type keeps its identity', () => {
    const parameter = reflect(Consumer);
    expect(parameter).toMatchObject({ kind: ReflectionKind.class, classType: Consumer });
    const constructor = (parameter as any).types.find((v: any) => v.kind === ReflectionKind.method && v.name === 'constructor');
    expect(constructor.parameters[0].type).toMatchObject({ kind: ReflectionKind.class, classType: Mutex });
});

test('token is the real class, provider and consumer in different files', () => {
    const mutex = new Mutex();
    const injector = new InjectorContext(new InjectorModule([{ provide: Mutex, useValue: mutex }, Consumer]));
    expect(injector.get<Consumer>().mutex).toBe(mutex);
});

test('token is the type of the re-export, provider and consumer in different files', () => {
    const mutex = new Mutex();
    const injector = new InjectorContext(new InjectorModule([provide<ReExported>({ useValue: mutex }), Consumer]));
    expect(injector.get<Consumer>().mutex).toBe(mutex);
});
