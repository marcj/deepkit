// Validation of the same object with Deepkit and other validation libraries.
// typia validators are generated ahead of time, see typia/validators.ts.
import { type } from 'arktype';
import { plainToInstance, Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested, validateSync } from 'class-validator';
import 'reflect-metadata';
import { Type as TB } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import * as v from 'valibot';
import { z } from 'zod';

import { BenchSuite } from '@deepkit/bench';
import { getValidatorFunction, guard, is, validate } from '@deepkit/type';

import { createInvalidUser, createUser, rotate, User } from './models.js';
import { isUser as typiaIs, validateUser as typiaValidate } from './typia-generated/typia/validators.js';

const zodUser = z.object({
    id: z.number(),
    email: z.string(),
    name: z.string(),
    age: z.number(),
    active: z.boolean(),
    roles: z.array(z.string()),
    profile: z.object({
        bio: z.string(),
        website: z.string(),
        social: z.object({ twitter: z.string().optional(), github: z.string().optional() }),
    }),
});

const valibotUser = v.object({
    id: v.number(),
    email: v.string(),
    name: v.string(),
    age: v.number(),
    active: v.boolean(),
    roles: v.array(v.string()),
    profile: v.object({
        bio: v.string(),
        website: v.string(),
        social: v.object({ twitter: v.optional(v.string()), github: v.optional(v.string()) }),
    }),
});

const arktypeUser = type({
    id: 'number',
    email: 'string',
    name: 'string',
    age: 'number',
    active: 'boolean',
    roles: 'string[]',
    profile: {
        bio: 'string',
        website: 'string',
        social: { 'twitter?': 'string', 'github?': 'string' },
    },
});

const typeboxUser = TypeCompiler.Compile(TB.Object({
    id: TB.Number(),
    email: TB.String(),
    name: TB.String(),
    age: TB.Number(),
    active: TB.Boolean(),
    roles: TB.Array(TB.String()),
    profile: TB.Object({
        bio: TB.String(),
        website: TB.String(),
        social: TB.Object({ twitter: TB.Optional(TB.String()), github: TB.Optional(TB.String()) }),
    }),
}));

class ClassValidatorSocial {
    @IsOptional() @IsString() twitter?: string;
    @IsOptional() @IsString() github?: string;
}

class ClassValidatorProfile {
    @IsString() bio!: string;
    @IsString() website!: string;
    @ValidateNested() @Type(() => ClassValidatorSocial) social!: ClassValidatorSocial;
}

class ClassValidatorUser {
    @IsNumber() id!: number;
    @IsString() email!: string;
    @IsString() name!: string;
    @IsNumber() age!: number;
    @IsBoolean() active!: boolean;
    @IsString({ each: true }) roles!: string[];
    @ValidateNested() @Type(() => ClassValidatorProfile) profile!: ClassValidatorProfile;
}

export default function () {
    const suite = new BenchSuite('comparison/validation');
    const valid = createUser();
    const invalid = createInvalidUser();
    const nextValid = rotate(createUser);
    const nextInvalid = rotate(createInvalidUser);

    // all libraries have to agree, otherwise the comparison is meaningless
    const checks: [string, (value: any) => boolean][] = [
        ['deepkit', value => is<User>(value)],
        ['typia', value => typiaIs(value)],
        ['zod', value => zodUser.safeParse(value).success],
        ['valibot', value => v.safeParse(valibotUser, value).success],
        ['arktype', value => !(arktypeUser(value) instanceof type.errors)],
        ['typebox', value => typeboxUser.Check(value)],
        ['class-validator', value => validateSync(plainToInstance(ClassValidatorUser, value)).length === 0],
    ];
    for (const [name, check] of checks) {
        if (!check(valid) || check(invalid)) throw new Error(`${name} does not validate the comparison data correctly`);
    }

    const deepkitGuard = guard<User>();
    const deepkitValidator = getValidatorFunction<User>();
    suite.add('deepkit is (valid)', () => is<User>(nextValid()));
    suite.add('deepkit guard (valid)', () => deepkitGuard(nextValid()));
    suite.add('deepkit getValidatorFunction (valid)', () => deepkitValidator(nextValid()));
    suite.add('typia is (valid)', () => typiaIs(nextValid()));
    suite.add('typebox Check (valid)', () => typeboxUser.Check(nextValid()));
    suite.add('arktype (valid)', () => arktypeUser(nextValid()));
    suite.add('valibot safeParse (valid)', () => v.safeParse(valibotUser, nextValid()));
    suite.add('zod safeParse (valid)', () => zodUser.safeParse(nextValid()));
    suite.add('class-validator (valid)', () => validateSync(plainToInstance(ClassValidatorUser, nextValid())));

    // with error reports
    suite.add('deepkit validate (invalid)', () => validate<User>(nextInvalid()));
    suite.add('typia validate (invalid)', () => typiaValidate(nextInvalid()));
    suite.add('typebox Errors (invalid)', () => [...typeboxUser.Errors(nextInvalid())]);
    suite.add('arktype (invalid)', () => arktypeUser(nextInvalid()));
    suite.add('valibot safeParse (invalid)', () => v.safeParse(valibotUser, nextInvalid()));
    suite.add('zod safeParse (invalid)', () => zodUser.safeParse(nextInvalid()));
    suite.add('class-validator (invalid)', () => validateSync(plainToInstance(ClassValidatorUser, nextInvalid())));

    return suite;
}

