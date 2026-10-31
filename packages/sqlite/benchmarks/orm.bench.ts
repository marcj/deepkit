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
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { AutoIncrement, PrimaryKey, Reference, cast, deserialize, entity, serialize } from '@deepkit/type';

/**
 * ORM benchmark - tests Deepkit ORM public API performance
 *
 * This benchmark tests real-world ORM operations:
 * - Entity hydration (creating instances from raw data)
 * - Query building and execution
 * - Unit of work operations (session, add, commit)
 * - Persistence operations (insert, patch)
 */

// Simple entity for basic benchmarks
@entity.name('bench_user')
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    username: string = '';
    email: string = '';
    age: number = 0;
    active: boolean = true;
    createdAt: Date = new Date();

    constructor(username?: string, email?: string, age?: number) {
        if (username) this.username = username;
        if (email) this.email = email;
        if (age !== undefined) this.age = age;
    }
}

// Entity with reference for join benchmarks
@entity.name('bench_post')
class Post {
    id: number & PrimaryKey & AutoIncrement = 0;
    title: string = '';
    content: string = '';
    createdAt: Date = new Date();

    constructor(
        public author: User & Reference,
        title?: string,
    ) {
        if (title) this.title = title;
    }
}

// Complex entity with nested data
@entity.name('bench_profile')
class Profile {
    id: number & PrimaryKey & AutoIncrement = 0;
    bio: string = '';
    settings: { theme: string; notifications: boolean; language: string } = {
        theme: 'dark',
        notifications: true,
        language: 'en',
    };
    tags: string[] = [];

    constructor(public user: User & Reference) {}
}

// Raw data to simulate database records
const rawUserData = {
    id: 1,
    username: 'john_doe',
    email: 'john@example.com',
    age: 30,
    active: true,
    createdAt: new Date('2024-01-01'),
};

const rawUserDataArray = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    username: `user_${i}`,
    email: `user${i}@example.com`,
    age: 20 + (i % 50),
    active: i % 2 === 0,
    createdAt: new Date('2024-01-01'),
}));

export default async function () {
    const suite = new BenchSuite('orm/sqlite');

    // Setup database with in-memory SQLite
    const adapter = new SQLiteDatabaseAdapter(':memory:');
    const database = new Database(adapter, [User, Post, Profile]);
    await adapter.createTables(database.entityRegistry);

    // Pre-populate with test data for query benchmarks
    const session = database.createSession();
    const users: User[] = [];
    for (let i = 0; i < 100; i++) {
        const user = new User(`user_${i}`, `user${i}@example.com`, 20 + (i % 50));
        users.push(user);
        session.add(user);
    }
    await session.commit();

    // ═══════════════════════════════════════════════════════════════════════════
    // ENTITY HYDRATION BENCHMARKS
    // ═══════════════════════════════════════════════════════════════════════════

    // Benchmark: Deserialize single entity from raw data
    suite.add('deserialize single entity', () => {
        deserialize<User>(rawUserData);
    });

    // Benchmark: Deserialize array of entities
    suite.add('deserialize 100 entities', () => {
        for (const raw of rawUserDataArray) {
            deserialize<User>(raw);
        }
    });

    // Benchmark: Cast (create typed instance)
    suite.add('cast single entity', () => {
        cast<User>(rawUserData);
    });

    // Benchmark: Serialize entity back to raw
    const sampleUser = cast<User>(rawUserData);
    suite.add('serialize single entity', () => {
        serialize<User>(sampleUser);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY BUILDING BENCHMARKS
    // ═══════════════════════════════════════════════════════════════════════════

    // Benchmark: Create simple query
    suite.add('create query', () => {
        database.query(User);
    });

    // Benchmark: Query with filter
    suite.add('query with filter', () => {
        database.query(User).filter({ username: 'user_1' });
    });

    // Benchmark: Query with multiple filters
    suite.add('query with multiple filters', () => {
        database
            .query(User)
            .filter({ active: true })
            .filter({ age: { $gte: 25 } })
            .orderBy('username', 'asc')
            .limit(10);
    });

    // Benchmark: Query with select
    suite.add('query with select', () => {
        database.query(User).select('id', 'username', 'email');
    });

    // Benchmark: Clone query (important for query reuse patterns)
    const baseQuery = database.query(User).filter({ active: true });
    suite.add('clone query', () => {
        baseQuery.clone();
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIT OF WORK BENCHMARKS
    // ═══════════════════════════════════════════════════════════════════════════

    // Benchmark: Create session
    suite.add('create session', () => {
        database.createSession();
    });

    // Benchmark: Add single item to session (no commit)
    suite.add('session add item', () => {
        const s = database.createSession();
        const u = new User('test', 'test@test.com', 25);
        s.add(u);
    });

    // Benchmark: Add multiple items to session (no commit)
    suite.add('session add 10 items', () => {
        const s = database.createSession();
        for (let i = 0; i < 10; i++) {
            s.add(new User(`test_${i}`, `test${i}@test.com`, 25));
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY EXECUTION BENCHMARKS (async)
    // ═══════════════════════════════════════════════════════════════════════════

    // Benchmark: Execute count query
    suite.add('query count', async () => {
        await database.query(User).count();
    });

    // Benchmark: Find single item
    suite.add('query findOne', async () => {
        await database.query(User).filter({ id: 1 }).findOne();
    });

    // Benchmark: Find multiple items (10)
    suite.add('query find (limit 10)', async () => {
        await database.query(User).limit(10).find();
    });

    // Benchmark: Find with filter
    suite.add('query find with filter', async () => {
        await database.query(User).filter({ active: true }).limit(10).find();
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PERSISTENCE BENCHMARKS (async)
    // ═══════════════════════════════════════════════════════════════════════════

    // Benchmark: Insert single item
    let insertCounter = 1000;
    suite.add('insert single item', async () => {
        const user = new User(`insert_user_${insertCounter++}`, 'insert@test.com', 30);
        await database.persist(user);
    });

    // Benchmark: Update via patch
    suite.add('patch single item', async () => {
        await database.query(User).filter({ id: 1 }).patchOne({ age: 31 });
    });

    // Cleanup: disconnect after benchmarks
    // Note: The benchmark runner will handle this as it runs async
    // database.disconnect();

    return suite;
}
