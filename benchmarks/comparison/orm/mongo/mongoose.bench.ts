// Mongoose with schemas, documents as Mongoose documents (no lean()).
import mongoose from 'mongoose';

import { createRowsWithId, mongoUrl, ormSuite, resetMongo, rowCount } from '../shared.js';

export default async function () {
    await resetMongo();
    const connection = await mongoose.createConnection(mongoUrl).asPromise();
    const fields = { name: { type: String, required: true }, ready: { type: Boolean, required: true }, priority: { type: Number, required: true } };
    const User = connection.model('User', new mongoose.Schema({ _id: Number, ...fields }, { versionKey: false }), 'bench_user');
    const Inserted = connection.model('Inserted', new mongoose.Schema(fields, { versionKey: false }), 'bench_insert');
    await User.insertMany(createRowsWithId(rowCount));

    return ormSuite('mongo', 'Mongoose', {
        findOne: id => User.findById(id).exec(),
        findAll: () => User.find().exec(),
        insertMany: async rows => void (await Inserted.insertMany(rows)),
        deleteInserted: async () => void (await Inserted.deleteMany({})),
        close: () => connection.close(),
    });
}
