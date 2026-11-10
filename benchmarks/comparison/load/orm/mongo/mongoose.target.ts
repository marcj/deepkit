// Mongoose with schemas under load, documents as Mongoose documents (no lean()).
import mongoose from 'mongoose';

import { mongoUrl } from '../../../orm/shared.js';
import { ormTarget, pageSize } from '../../orm-load.js';

export const target = ormTarget(async ({ poolSize }) => {
    const connection = await mongoose.createConnection(mongoUrl, { maxPoolSize: poolSize }).asPromise();
    const fields = {
        name: { type: String, required: true },
        ready: { type: Boolean, required: true },
        priority: { type: Number, required: true },
    };
    const User = connection.model(
        'User',
        new mongoose.Schema({ _id: Number, ...fields }, { versionKey: false }),
        'bench_user',
    );
    const Inserted = connection.model('Inserted', new mongoose.Schema(fields, { versionKey: false }), 'bench_insert');
    return {
        findOne: id => User.findById(id).exec() as any,
        findPage: afterId =>
            User.find({ _id: { $gt: afterId } })
                .sort({ _id: 1 })
                .limit(pageSize)
                .exec() as any,
        insertOne: async row => (await Inserted.create(row))._id,
    };
});
