import { FrameworkModule } from '../src/module.js';
import { expect, test } from '@jest/globals';
import { HttpBody, HttpKernel, HttpRequest, HttpRouterRegistry } from '@deepkit/http';
import { Logger } from '@deepkit/logger';
import { createTestingApp } from '../src/testing.js';

test('functional http app', async () => {
    const test = createTestingApp({
        imports: [new FrameworkModule()]
    });

    const router = test.app.get(HttpRouterRegistry);

    router.get('/greet/:name', (name: string, logger: Logger) => {
        logger.log(`${name} was greeted`);
        return `Greetings ${name}`;
    });

    const httpKernel = test.app.get(HttpKernel);
    const response = await httpKernel.request(HttpRequest.GET('/greet/Peter'));
    expect(response.json).toBe('Greetings Peter');
});

test('http parse config', async () => {
    const test = createTestingApp({
        imports: [new FrameworkModule({
            http: {
                parser: {
                    maxFields: 1
                }
            }
        })]
    });

    const router = test.app.get(HttpRouterRegistry);

    router.post('/add', (data: HttpBody<{ field1: string, field2: number }>) => {
        return data;
    });

    const httpKernel = test.app.get(HttpKernel);
    const request = HttpRequest.POST('/add');
    request.header('content-type', 'application/x-www-form-urlencoded');
    request.body('field1=foo&field2=42');
    //note: JSON fields are not handled by formidable.maxFields
    const response = await httpKernel.request(request);
    expect(response.statusCode).toBe(413);
    expect(response.json).toEqual({ message: 'options.maxFields (1) exceeded' });
});
