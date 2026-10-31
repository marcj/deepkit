// Serialization of the same object to JSON-compatible data and back, with Deepkit and other libraries.
import { instanceToPlain, plainToInstance, Type } from 'class-transformer';
import 'reflect-metadata';

import { BenchSuite } from '@deepkit/bench';
import { cast, deserialize, getSerializeFunction, serialize, serializer, typeOf } from '@deepkit/type';

import { createUser, rotate, User } from './models.js';
import { stringifyUser as typiaStringify } from './typia-generated/typia/validators.js';

class TransformerSocial {
    twitter?: string;
    github?: string;
}

class TransformerProfile {
    bio!: string;
    website!: string;
    @Type(() => TransformerSocial) social!: TransformerSocial;
}

class TransformerUser {
    id!: number;
    email!: string;
    name!: string;
    age!: number;
    active!: boolean;
    roles!: string[];
    @Type(() => TransformerProfile) profile!: TransformerProfile;
}

export default function () {
    const suite = new BenchSuite('comparison/serialization');
    const nextUser = rotate(createUser);
    const nextPlain = rotate(i => JSON.parse(JSON.stringify(createUser(i))));
    const nextInstance = rotate(i => plainToInstance(TransformerUser, createUser(i)));
    const serializeUser = getSerializeFunction(typeOf<User>(), serializer.serializeRegistry);

    // to JSON string
    suite.add('JSON.stringify', () => JSON.stringify(nextUser()));
    suite.add('deepkit serialize + JSON.stringify', () => JSON.stringify(serialize<User>(nextUser())));
    suite.add('deepkit getSerializeFunction + JSON.stringify', () => JSON.stringify(serializeUser(nextUser())));
    suite.add('typia json.stringify', () => typiaStringify(nextUser()));

    // instance to plain object
    suite.add('deepkit serialize', () => serialize<User>(nextUser()));
    suite.add('class-transformer instanceToPlain', () => instanceToPlain(nextInstance()));

    // plain object to typed object
    suite.add('deepkit deserialize', () => deserialize<User>(nextPlain()));
    suite.add('deepkit cast (with validation)', () => cast<User>(nextPlain()));
    suite.add('class-transformer plainToInstance', () => plainToInstance(TransformerUser, nextPlain()));

    return suite;
}
