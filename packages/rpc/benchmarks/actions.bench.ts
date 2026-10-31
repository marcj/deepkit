/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import { DirectClient, RpcKernel, rpc } from '@deepkit/rpc';
import { Positive, entity } from '@deepkit/type';

/**
 * RPC Action Execution Benchmark
 *
 * Tests the performance of RPC action execution:
 * 1. RpcActionClient creation and setup
 * 2. Parameter serialization (small, medium, complex types)
 * 3. Return type deserialization
 * 4. Type caching effectiveness
 * 5. Controller proxy overhead
 * 6. Full action round-trip
 */

// ============================================================================
// Test Data Types
// ============================================================================

@entity.name('bench/User')
class User {
    constructor(
        public id: number,
        public name: string,
        public email: string,
    ) {}
}

@entity.name('bench/Product')
class Product {
    constructor(
        public id: number,
        public name: string,
        public price: number,
        public quantity: number,
        public tags: string[],
    ) {}
}

interface ComplexResult {
    total: number;
    items: User[];
    metadata: {
        page: number;
        perPage: number;
        hasMore: boolean;
    };
}

// ============================================================================
// Test Controllers
// ============================================================================

class SimpleController {
    @rpc.action()
    ping(): string {
        return 'pong';
    }

    @rpc.action()
    echo(value: string): string {
        return value;
    }

    @rpc.action()
    add(a: number, b: number): number {
        return a + b;
    }

    @rpc.action()
    validateNumber(value: number & Positive): number {
        return value;
    }
}

class UserController {
    @rpc.action()
    getUser(id: number): User {
        return new User(id, `User ${id}`, `user${id}@example.com`);
    }

    @rpc.action()
    createUser(name: string, email: string): User {
        return new User(Date.now(), name, email);
    }

    @rpc.action()
    listUsers(page: number, perPage: number): ComplexResult {
        const items: User[] = [];
        for (let i = 0; i < perPage; i++) {
            items.push(new User(page * perPage + i, `User ${i}`, `user${i}@example.com`));
        }
        return {
            total: 100,
            items,
            metadata: {
                page,
                perPage,
                hasMore: page * perPage + perPage < 100,
            },
        };
    }

    @rpc.action()
    processUsers(users: User[]): number {
        return users.length;
    }
}

class ProductController {
    @rpc.action()
    getProduct(id: number): Product {
        return new Product(id, `Product ${id}`, 99.99, 10, ['tag1', 'tag2']);
    }

    @rpc.action()
    createProduct(name: string, price: number, quantity: number, tags: string[]): Product {
        return new Product(Date.now(), name, price, quantity, tags);
    }

    @rpc.action()
    bulkCreate(products: Product[]): number {
        return products.length;
    }

    @rpc.action()
    search(query: string, filters: { minPrice?: number; maxPrice?: number; tags?: string[] }): Product[] {
        const results: Product[] = [];
        for (let i = 0; i < 10; i++) {
            results.push(new Product(i, `${query} ${i}`, 50 + i * 10, 5, filters.tags || ['default']));
        }
        return results;
    }
}

// ============================================================================
// Benchmark
// ============================================================================

export default async function () {
    const suite = new BenchSuite('rpc/actions');

    // ------------------------------------------------------------------------
    // Setup: Create kernel and register controllers
    // ------------------------------------------------------------------------

    const kernel = new RpcKernel();
    kernel.registerController(SimpleController, 'simple');
    kernel.registerController(UserController, 'user');
    kernel.registerController(ProductController, 'product');

    // Create client and controller proxies
    const client = new DirectClient(kernel);
    await client.connect();

    const simpleController = client.controller<SimpleController>('simple');
    const userController = client.controller<UserController>('user');
    const productController = client.controller<ProductController>('product');

    // Warmup: Call each action to trigger JIT compilation and type caching
    for (let i = 0; i < 100; i++) {
        await simpleController.ping();
        await simpleController.echo('test');
        await simpleController.add(1, 2);
        await userController.getUser(1);
        await userController.createUser('Test', 'test@example.com');
        await productController.getProduct(1);
    }

    // Verification
    const pingResult = await simpleController.ping();
    if (pingResult !== 'pong') throw new Error('Ping failed');

    const echoResult = await simpleController.echo('hello');
    if (echoResult !== 'hello') throw new Error('Echo failed');

    const addResult = await simpleController.add(2, 3);
    if (addResult !== 5) throw new Error('Add failed');

    const user = await userController.getUser(1);
    if (!(user instanceof User)) throw new Error('GetUser failed: not a User instance');
    if (user.id !== 1) throw new Error('GetUser failed: wrong id');

    const product = await productController.getProduct(1);
    if (!(product instanceof Product)) throw new Error('GetProduct failed: not a Product instance');

    // ------------------------------------------------------------------------
    // 1. Simple Actions (minimal overhead)
    // ------------------------------------------------------------------------

    suite.add('simple: ping (no args, string return)', async () => {
        await simpleController.ping();
    });

    suite.add('simple: echo (string arg, string return)', async () => {
        await simpleController.echo('test');
    });

    suite.add('simple: add (2 number args, number return)', async () => {
        await simpleController.add(1, 2);
    });

    suite.add('simple: validateNumber (with validation)', async () => {
        await simpleController.validateNumber(42);
    });

    // ------------------------------------------------------------------------
    // 2. Entity Return Types (class instances)
    // ------------------------------------------------------------------------

    suite.add('user: getUser (entity return)', async () => {
        await userController.getUser(1);
    });

    suite.add('user: createUser (2 string args, entity return)', async () => {
        await userController.createUser('Test User', 'test@example.com');
    });

    suite.add('product: getProduct (entity return)', async () => {
        await productController.getProduct(1);
    });

    suite.add('product: createProduct (complex args, entity return)', async () => {
        await productController.createProduct('New Product', 199.99, 50, ['electronics', 'sale']);
    });

    // ------------------------------------------------------------------------
    // 3. Complex Return Types
    // ------------------------------------------------------------------------

    suite.add('user: listUsers (complex result with array)', async () => {
        await userController.listUsers(1, 10);
    });

    suite.add('product: search (object args, array return)', async () => {
        await productController.search('laptop', { minPrice: 100, maxPrice: 500, tags: ['electronics'] });
    });

    // ------------------------------------------------------------------------
    // 4. Array Parameter Serialization
    // ------------------------------------------------------------------------

    const smallUserArray = [new User(1, 'User 1', 'user1@example.com'), new User(2, 'User 2', 'user2@example.com')];

    const mediumUserArray: User[] = [];
    for (let i = 0; i < 10; i++) {
        mediumUserArray.push(new User(i, `User ${i}`, `user${i}@example.com`));
    }

    const largeUserArray: User[] = [];
    for (let i = 0; i < 100; i++) {
        largeUserArray.push(new User(i, `User ${i}`, `user${i}@example.com`));
    }

    suite.add('user: processUsers (2 items)', async () => {
        await userController.processUsers(smallUserArray);
    });

    suite.add('user: processUsers (10 items)', async () => {
        await userController.processUsers(mediumUserArray);
    });

    suite.add('user: processUsers (100 items)', async () => {
        await userController.processUsers(largeUserArray);
    });

    const smallProductArray = [
        new Product(1, 'Product 1', 99.99, 10, ['tag1']),
        new Product(2, 'Product 2', 149.99, 5, ['tag2']),
    ];

    const mediumProductArray: Product[] = [];
    for (let i = 0; i < 10; i++) {
        mediumProductArray.push(new Product(i, `Product ${i}`, 50 + i * 10, i * 2, ['tag1', 'tag2']));
    }

    suite.add('product: bulkCreate (2 items)', async () => {
        await productController.bulkCreate(smallProductArray);
    });

    suite.add('product: bulkCreate (10 items)', async () => {
        await productController.bulkCreate(mediumProductArray);
    });

    // ------------------------------------------------------------------------
    // 5. Type Caching Effectiveness
    // ------------------------------------------------------------------------

    // Create a fresh client to test cold start vs cached
    const freshClient = new DirectClient(kernel);
    await freshClient.connect();
    const freshSimple = freshClient.controller<SimpleController>('simple');

    // First call (types not cached)
    suite.add('type cache: first call (cold)', async () => {
        const c = new DirectClient(kernel);
        await c.connect();
        const ctrl = c.controller<SimpleController>('simple');
        await ctrl.ping();
        await c.disconnect();
    });

    // Subsequent calls (types cached)
    suite.add('type cache: subsequent calls (warm)', async () => {
        await freshSimple.ping();
    });

    await freshClient.disconnect();

    // ------------------------------------------------------------------------
    // 6. Multiple Sequential Calls
    // ------------------------------------------------------------------------

    suite.add('sequential: 5 simple calls', async () => {
        await simpleController.ping();
        await simpleController.ping();
        await simpleController.ping();
        await simpleController.ping();
        await simpleController.ping();
    });

    suite.add('sequential: 5 entity calls', async () => {
        await userController.getUser(1);
        await userController.getUser(2);
        await userController.getUser(3);
        await userController.getUser(4);
        await userController.getUser(5);
    });

    // ------------------------------------------------------------------------
    // 7. Connection Management
    // ------------------------------------------------------------------------

    suite.add('connect + call + disconnect', async () => {
        const c = new DirectClient(kernel);
        await c.connect();
        const ctrl = c.controller<SimpleController>('simple');
        await ctrl.ping();
        await c.disconnect();
    });

    // Cleanup
    await client.disconnect();

    return suite;
}
