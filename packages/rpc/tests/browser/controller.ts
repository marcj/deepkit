import { Observable } from 'rxjs';

import { rpc } from '@deepkit/rpc';

export class User {
    created: Date = new Date('2026-01-02T03:04:05Z');

    constructor(
        public id: number,
        public name: string,
    ) {}
}

@rpc.controller('test')
export class TestController {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    user(user: User): User {
        return new User(user.id + 1, user.name.toUpperCase());
    }

    @rpc.action()
    bytes(size: number): Uint8Array {
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) data[i] = i % 251;
        return data;
    }

    @rpc.action()
    sum(data: Uint8Array): number {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum;
    }

    @rpc.action()
    count(to: number): Observable<number> {
        return new Observable(subscriber => {
            for (let i = 1; i <= to; i++) subscriber.next(i);
            subscriber.complete();
        });
    }
}
