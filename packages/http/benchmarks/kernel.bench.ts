// Complete HTTP requests through the kernel (in memory, without network): routing, middleware, dependency
// injection of the controller and its service, parameter deserialization and validation, response serialization.
import { App } from '@deepkit/app';
import { BenchSuite } from '@deepkit/bench';
import { http, HttpBody, HttpKernel, HttpModule, HttpQuery, HttpRequest } from '@deepkit/http';
import { MinLength, Positive } from '@deepkit/type';

interface User {
    id: number;
    name: string;
    email: string;
    created: Date;
}

class UserService {
    get(id: number): User {
        return { id, name: 'User ' + id, email: `user${id}@example.com`, created: new Date(0) };
    }

    list(limit: number): User[] {
        return Array.from({ length: limit }, (_, i) => this.get(i + 1));
    }
}

@http.controller('/users')
class UserController {
    constructor(private users: UserService) {}

    @http.GET(':id')
    get(id: number & Positive): User {
        return this.users.get(id);
    }

    @http.GET('')
    list(limit: HttpQuery<number & Positive> = 10): User[] {
        return this.users.list(limit);
    }

    @http.POST('')
    create(body: HttpBody<{ name: string & MinLength<3>; email: string }>): User {
        return { id: 1, ...body, created: new Date(0) };
    }
}

export default async function () {
    const suite = new BenchSuite('http/kernel');
    const app = new App({
        controllers: [UserController],
        providers: [UserService],
        imports: [new HttpModule()],
    });
    const kernel = app.get(HttpKernel);

    const check = await kernel.request(HttpRequest.GET('/users/1'));
    if (check.statusCode !== 200 || check.json.name !== 'User 1') throw new Error('Unexpected response: ' + check.bodyString);

    let i = 0;
    suite.add('GET with route parameter', async () => {
        await kernel.request(HttpRequest.GET('/users/' + ((i++ % 100) + 1)));
    });
    suite.add('GET list of 10 with query parameter', async () => {
        await kernel.request(HttpRequest.GET('/users').query({ limit: 10 }));
    });
    suite.add('POST with validated JSON body', async () => {
        await kernel.request(HttpRequest.POST('/users').json({ name: 'Peter ' + (i++ % 100), email: 'peter@example.com' }));
    });
    suite.add('validation error (400)', async () => {
        await kernel.request(HttpRequest.GET('/users/-1'));
    });
    suite.add('not found (404)', async () => {
        await kernel.request(HttpRequest.GET('/unknown'));
    });

    return suite;
}
