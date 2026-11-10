/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { SqlSerializer } from '@deepkit/sql';
import { ReflectionKind, TemplateState, Type, TypeUnion, handleUnion } from '@deepkit/type';

class PostgresSerializer extends SqlSerializer {
    name = 'postgres';

    constructor() {
        super();
        // The client returns json and jsonb columns parsed. SQLite and MySQL return text, so the SQL serializer
        // parses strings of such columns: here that parsed a string value a second time, a `string | number`
        // or `any` column holding 'text' failed with "Unexpected token".
        this.deserializeRegistry.register(ReflectionKind.union, (type: TypeUnion, state: TemplateState) => handleUnion(type, state));
        const asIs = (type: Type, state: TemplateState) => state.addSetter(state.accessor);
        this.deserializeRegistry.register(ReflectionKind.any, asIs);
        this.deserializeRegistry.register(ReflectionKind.unknown, asIs);
    }
}

export const postgresSerializer = new PostgresSerializer();
