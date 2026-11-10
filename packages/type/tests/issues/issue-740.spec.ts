import { expect, test } from '@jest/globals';

import { ReceiveType, resolveReceiveType } from '../../src/reflection/reflection.js';
import { ReflectionKind } from '../../src/reflection/type.js';

class Service {
    get<T>(type?: ReceiveType<T>) {
        return resolveReceiveType(type).kind;
    }
}

test('a call through element access receives its type argument', () => {
    const service = new Service();
    expect(service.get<string>()).toBe(ReflectionKind.string);
    expect(service['get']<string>()).toBe(ReflectionKind.string);
    const name = 'get';
    expect(service[name]<number>()).toBe(ReflectionKind.number);
});

test('the receiver of an element access call is evaluated once', () => {
    const holder = { service: new Service() };
    expect(holder.service['get']<string>()).toBe(ReflectionKind.string);

    let calls = 0;
    const getService = () => {
        calls++;
        return holder.service;
    };
    expect(getService()['get']<string>()).toBe(ReflectionKind.string);
    expect(calls).toBe(1);
});
