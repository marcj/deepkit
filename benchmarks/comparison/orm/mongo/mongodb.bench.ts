// Baseline: the official MongoDB driver directly, documents as the driver returns them.
import { MongoClient } from 'mongodb';

import { createRowsWithId, mongoUrl, ormSuite, resetMongo, Row, rowCount } from '../shared.js';

export default async function () {
    await resetMongo();
    const client = new MongoClient(mongoUrl);
    await client.connect();
    const users = client.db().collection<Row & { _id: number }>('bench_user');
    const inserted = client.db().collection<Row>('bench_insert');
    await users.insertMany(createRowsWithId(rowCount));

    return ormSuite('mongo', 'mongodb', {
        findOne: id => users.findOne({ _id: id }),
        findAll: () => users.find().toArray(),
        // copies, because insertMany adds an _id to the documents
        insertMany: async rows => void (await inserted.insertMany(rows.map(v => ({ ...v })))),
        deleteInserted: async () => void (await inserted.deleteMany({})),
        close: () => client.close(),
    });
}
