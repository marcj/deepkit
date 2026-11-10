// Baseline under load: the official MongoDB driver directly, documents as the driver returns them.
import { MongoClient } from 'mongodb';

import { Row, mongoUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ poolSize }) => {
    const client = new MongoClient(mongoUrl, { maxPoolSize: poolSize });
    await client.connect();
    const users = client.db().collection<Row & { _id: number }>('bench_user');
    const inserted = client.db().collection<Row>('bench_insert');
    return {
        findOne: id => users.findOne({ _id: id }),
        findPage: afterId =>
            users
                .find({ _id: { $gt: afterId } })
                .sort({ _id: 1 })
                .limit(pageSize)
                .toArray(),
        // a copy, because insertOne adds the _id to the document
        insertOne: async row => (await inserted.insertOne({ ...row })).insertedId,
    };
});
