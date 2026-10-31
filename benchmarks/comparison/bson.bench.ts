// BSON encoding of the same object with Deepkit and the official bson package (used by the MongoDB driver).
import { deserialize as bsonDeserialize, serialize as bsonSerialize } from 'bson';

import { BenchSuite } from '@deepkit/bench';
import { getBSONDeserializer, getBSONSerializer } from '@deepkit/bson';

import { createUser, rotate, User } from './models.js';

export default function () {
    const suite = new BenchSuite('comparison/bson');
    const serializeUser = getBSONSerializer<User>();
    const deserializeUser = getBSONDeserializer<User>();
    const nextUser = rotate(createUser);
    const nextBson = rotate(i => serializeUser(createUser(i)));

    // both have to produce the same document
    if (JSON.stringify(bsonDeserialize(serializeUser(createUser()))) !== JSON.stringify(createUser())) {
        throw new Error('deepkit BSON does not match the official bson package');
    }

    suite.add('deepkit serialize', () => serializeUser(nextUser()));
    suite.add('bson serialize', () => bsonSerialize(nextUser()));
    suite.add('deepkit deserialize', () => deserializeUser(nextBson()));
    suite.add('bson deserialize', () => bsonDeserialize(nextBson()));

    return suite;
}
