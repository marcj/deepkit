/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { convertQueryFilter, DatabaseError, FilterQuery } from '@deepkit/orm';
import { isReferenceType, ReflectionClass, ReflectionKind, resolvePath, serialize, Serializer } from '@deepkit/type';

export function getSqlFilter<T>(classSchema: ReflectionClass<any>, filter: FilterQuery<T>, parameters: { [name: string]: any } = {}, serializer: Serializer): any {
    return convertQueryFilter(classSchema.getClassType(), (filter || {}), (convertClass: ReflectionClass<any>, path: string, value: any) => {
        const property = resolvePath(path, classSchema.type);
        const type = property.kind === ReflectionKind.property || property.kind === ReflectionKind.propertySignature ? property.type : property;
        if (isReferenceType(type) && value !== null && value !== undefined) {
            const primaryKey = ReflectionClass.from(type).getPrimary();
            if ('object' !== typeof value) return serialize(value, undefined, serializer, undefined, primaryKey.type);
            // serializing such an object would read an undefined primary key and drop the condition
            if (value[primaryKey.name] === undefined) {
                throw new DatabaseError(`Filter on reference ${path} needs an entity, its primary key or { ${primaryKey.name} }`);
            }
        }
        return serialize(value, undefined, serializer, undefined, property);
    }, {}, {
        $parameter: (name, value) => {
            if (undefined === parameters[value]) {
                throw new Error(`Parameter ${value} not defined in ${classSchema.getClassName()} query.`);
            }
            return parameters[value];
        }
    });
}
