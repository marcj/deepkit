import { expect, test } from '@jest/globals';
import { HttpKernel, HttpRequest } from '@deepkit/http';
import { AutoIncrement, entity, PrimaryKey, Unique } from '@deepkit/type';
import { createCrudRoutes } from '../src/crud.js';
import { FrameworkModule } from '../src/module.js';
import { createTestingApp } from '../src/testing.js';

@entity.name('user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    username: string & Unique = '';
    name: string = '';
}

async function setup(identifier?: 'username') {
    const testing = createTestingApp({ imports: [new FrameworkModule(), createCrudRoutes([User], { identifier })] }, [User]);
    const http = testing.app.get(HttpKernel);
    const create = HttpRequest.POST('/entity/user').json({ id: 1, username: 'john', name: 'John' });
    expect((await http.request(create)).statusCode).toBe(201);
    return http;
}

test('crud routes with the primary key as identifier', async () => {
    const http = await setup();
    expect((await http.request(HttpRequest.GET('/entity/user/1'))).json).toMatchObject({ username: 'john' });
    expect((await http.request(HttpRequest.PUT('/entity/user/1').json({ name: 'Johnny' }))).json).toMatchObject({ name: 'Johnny' });
    expect((await http.request(HttpRequest.DELETE('/entity/user/1'))).json).toEqual({ deleted: 1 });
    expect((await http.request(HttpRequest.GET('/entity/user/1'))).statusCode).toBe(404);
});

test('crud routes with a custom identifier (#395)', async () => {
    const http = await setup('username');
    expect((await http.request(HttpRequest.GET('/entity/user/john'))).json).toMatchObject({ id: 1, name: 'John' });
    expect((await http.request(HttpRequest.GET('/entity/user/nobody'))).statusCode).toBe(404);
    expect((await http.request(HttpRequest.PUT('/entity/user/john').json({ name: 'Johnny' }))).json).toMatchObject({ name: 'Johnny' });
    expect((await http.request(HttpRequest.DELETE('/entity/user/john'))).json).toEqual({ deleted: 1 });
    expect((await http.request(HttpRequest.GET('/entity/user/john'))).statusCode).toBe(404);
});
