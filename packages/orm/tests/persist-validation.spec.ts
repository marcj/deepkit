import { MinLength, PrimaryKey, entity } from '@deepkit/type';
import { expect, test } from '@jest/globals';

import { Database } from '../src/database.js';
import { MemoryDatabaseAdapter } from '../src/memory-db.js';
import { DatabaseValidationError } from '../src/type.js';

@entity.name('persistValidated')
class Item {
    constructor(
        public id: number & PrimaryKey,
        public name: string & MinLength<3>,
    ) {}
}

test('every item of a batch is validated, with the error messages', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    const session = database.createSession();
    session.add(new Item(1, 'Peter'), new Item(2, 'x'));

    const error = await session.commit().catch(error => error);
    expect(error).toBeInstanceOf(DatabaseValidationError);
    expect((error as DatabaseValidationError).errors).toMatchObject([{ path: 'name', code: 'minLength' }]);
    expect(await database.query(Item).count()).toBe(0);
});

test('changes after a commit are detected on the same item', async () => {
    const database = new Database(new MemoryDatabaseAdapter(), [Item]);
    const session = database.createSession();
    const item = new Item(1, 'Peter');
    session.add(item);
    await session.commit();

    item.name = 'Peter2';
    session.add(item);
    await session.commit();
    expect((await database.query(Item).findOne()).name).toBe('Peter2');
});
