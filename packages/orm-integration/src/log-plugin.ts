import { LogPlugin, LogType, LogQuery, LogSession } from '@deepkit/orm';
import { AutoIncrement, deserialize, entity, PrimaryKey } from '@deepkit/type';
import { DatabaseFactory } from './test.js';
import { expect } from '@jest/globals';

export const logPluginTests = {
    async query(databaseFactory: DatabaseFactory) {
        @entity.name('logUser1')
        class User {
            id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public username: string) {
            }
        }

        const database = await databaseFactory([User], [new LogPlugin]);

        const plugin = database.pluginRegistry.getPlugin(LogPlugin);
        const userLogEntity = plugin.getLogEntity(User);

        await database.persist(deserialize<User>({ id: 1, username: 'Peter' }));
        await database.persist(deserialize<User>({ id: 2, username: 'Joe' }));
        await database.persist(deserialize<User>({ id: 3, username: 'Lizz' }));

        {
            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(3);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },
            ]);
        }

        await database.query(User).filter({ id: 1 }).patchOne({ username: 'Peter2' });

        {
            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(4);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },

                { id: 4, type: LogType.Updated, reference: 1, changedFields: ['username'] },
            ]);
        }

        const patchMany = await database.query(User).patchMany({ username: '' });

        {
            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(7);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },

                { id: 4, type: LogType.Updated, reference: 1, changedFields: ['username'] },

                { id: 5, type: LogType.Updated, reference: patchMany.primaryKeys[0].id, changedFields: ['username'] },
                { id: 6, type: LogType.Updated, reference: patchMany.primaryKeys[1].id, changedFields: ['username'] },
                { id: 7, type: LogType.Updated, reference: patchMany.primaryKeys[2].id, changedFields: ['username'] },
            ]);
        }

        const deleteMany = await database.query(User).lift(LogQuery).byLogAuthor('Foo').returnPrimaryKeys().deleteMany();

        {
            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(10);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },

                { id: 4, type: LogType.Updated, reference: 1, changedFields: ['username'] },

                { id: 5, type: LogType.Updated, reference: patchMany.primaryKeys[0].id, changedFields: ['username'] },
                { id: 6, type: LogType.Updated, reference: patchMany.primaryKeys[1].id, changedFields: ['username'] },
                { id: 7, type: LogType.Updated, reference: patchMany.primaryKeys[2].id, changedFields: ['username'] },

                { id: 8, type: LogType.Deleted, reference: deleteMany.primaryKeys[0].id, author: 'Foo' },
                { id: 9, type: LogType.Deleted, reference: deleteMany.primaryKeys[1].id, author: 'Foo' },
                { id: 10, type: LogType.Deleted, reference: deleteMany.primaryKeys[2].id, author: 'Foo' },
            ]);
        }

        database.disconnect();
    },

    async session(databaseFactory: DatabaseFactory) {
        @entity.name('logUser2')
        class User {
            id: number & PrimaryKey & AutoIncrement = 0;

            constructor(public username: string) {
            }
        }

        const database = await databaseFactory([User], [new LogPlugin]);

        const session = database.createSession();
        const peter = new User('peter');
        const joe = new User('Joe');
        const lizz = new User('Lizz');
        session.add(peter, joe, lizz);
        await session.commit();
        expect(await database.query(User).count()).toBe(3);

        const plugin = database.pluginRegistry.getPlugin(LogPlugin);
        const userLogEntity = plugin.getLogEntity(User);

        {
            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(3);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },
            ]);
        }

        {
            const peter = await database.query(User).filter({ id: 1 }).findOne();
            peter.username = 'Peter2';
            await database.persist(peter);

            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(4);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },
                { id: 4, type: LogType.Updated, reference: 1, changedFields: ['username'] },
            ]);
        }

        {
            const peter = await database.query(User).filter({ id: 1 }).findOne();
            const session = database.createSession();
            session.remove(peter);
            session.from(LogSession).setAuthor('Foo');
            await session.commit();

            const logEntries = await database.query(userLogEntity).find();
            expect(logEntries).toHaveLength(5);
            expect(logEntries).toMatchObject([
                { id: 1, type: LogType.Added, reference: 1 },
                { id: 2, type: LogType.Added, reference: 2 },
                { id: 3, type: LogType.Added, reference: 3 },
                { id: 4, type: LogType.Updated, reference: 1, changedFields: ['username'] },
                { id: 5, type: LogType.Deleted, reference: 1, author: 'Foo' },
            ]);
        }

        database.disconnect();
    },
};
