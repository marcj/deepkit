import { expect, test } from '@jest/globals';

import { Database } from '@deepkit/orm';
import { AutoIncrement, PrimaryKey, entity } from '@deepkit/type';

import { SQLiteDatabaseAdapter } from '../src/sqlite-adapter.js';

//https://github.com/marcj/deepkit/issues/726
test('unknown entity field is stored as JSON like any', async () => {
    @entity.name('issue726')
    class WebhookEvent {
        id: number & PrimaryKey & AutoIncrement = 0;
        payload: unknown = null;
        context: any = null;
    }

    const database = new Database(new SQLiteDatabaseAdapter(':memory:'), [WebhookEvent]);
    await database.migrate();

    const event = new WebhookEvent();
    event.payload = { orderId: 42 };
    event.context = { orderId: 42 };
    await database.persist(event);

    const loaded = await database.query(WebhookEvent).findOne();
    expect(loaded.context).toEqual({ orderId: 42 });
    expect(loaded.payload).toEqual({ orderId: 42 });
    database.disconnect();
});
