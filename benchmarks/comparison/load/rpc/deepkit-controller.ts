// The controller of the Deepkit RPC load benchmarks. Arguments are validated from their types, results are serialized as BSON.
import { rpc } from '@deepkit/rpc';
import { Email, MinLength } from '@deepkit/type';

import { createUsers } from '../../rpc/shared.js';

export interface User {
    id: number;
    name: string & MinLength<3>;
    email: string & Email;
    active: boolean;
    roles: string[];
}

@rpc.controller('/bench')
export class Controller {
    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    saveUser(user: User): User {
        return user;
    }

    @rpc.action()
    listUsers(count: number): User[] {
        return createUsers(count);
    }
}
