/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import type { QueryDatabaseDeleteEvent, QueryDatabasePatchEvent, UnitOfWorkEvent, UnitOfWorkUpdateEvent } from './event.js';
import type { Database } from './database.js';
import { ReflectionClass, ReflectionProperty } from '@deepkit/type';

type IncomingReference = { classSchema: ReflectionClass<any>, property: ReflectionProperty };

/**
 * For database adapter that are not capable of having foreign key constraints
 * this provides a virtual implementation that covers most of the same functionality.
 */
export class VirtualForeignKeyConstraint {
    constructor(protected database: Database) {
    }

    protected resolveReferencesTo(fromClassSchema: ReflectionClass<any>): IncomingReference[] {
        //note: not all relations have a backReference defined, so we need to go through all registered class schemas
        const references = fromClassSchema.getJitContainer()['orm/incoming-references'];
        if (references) return references;

        const res: IncomingReference[] = [];

        for (const classSchema of this.database.entityRegistry.all()) {
            for (const reference of classSchema.getReferences()) {
                if (!reference.isReference()) continue;
                if (reference.getReference()!.onDelete === 'NO ACTION') continue;

                if (reference.getResolvedReflectionClass().isSchemaOf(fromClassSchema.getClassType())) {
                    res.push({ classSchema, property: reference });
                }
            }
        }

        fromClassSchema.getJitContainer()['orm/incoming-references'] = res;
        return res;
    }

    /**
     * The listener is registered for every entity, but only referenced entities need the keys.
     */
    onQueryDeletePre(event: QueryDatabaseDeleteEvent<any>) {
        if (this.resolveReferencesTo(event.classSchema).length) event.deleteResult.loadPrimaryKeys();
    }

    async onQueryDelete(event: QueryDatabaseDeleteEvent<any>) {
        const references = this.resolveReferencesTo(event.classSchema);
        if (!references.length) return;
        if (!event.deleteResult.loadedPrimaryKeys.length) return;

        for (const { classSchema, property } of references) {
            const query = event.databaseSession.query(classSchema).filter({ [property.name]: { $in: event.deleteResult.loadedPrimaryKeys } });
            const options = property.getReference()!;
            if (options.onDelete === undefined || options.onDelete === 'CASCADE') {
                await query.deleteMany();
            } else if (options.onDelete === 'SET NULL') {
                await query.patchMany({ [property.name]: null });
            } else if (options.onDelete === 'SET DEFAULT') {
                await query.patchMany({ [property.name]: property.getDefaultValue() });
            }
        }
    }

    async onQueryPatch(event: QueryDatabasePatchEvent<any>) {
        const references = this.resolveReferencesTo(event.classSchema);
        if (!references.length) return;
        if (!event.patchResult.primaryKeys.length) return;
        const primaryKeyName = event.classSchema.getPrimary().name;

        for (const { classSchema, property } of references) {
            if (!event.patch.has(property.name)) continue;

            const query = event.databaseSession.query(classSchema).filter({ [property.name]: { $in: event.patchResult.primaryKeys } });
            const options = property.getReference()!;

            if (options.onDelete === undefined || options.onDelete === 'CASCADE') {
                await query.patchMany({ [property.name]: event.patch.$set[primaryKeyName] });
            } else if (options.onDelete === 'SET NULL') {
                await query.patchMany({ [property.name]: null });
            } else if (options.onDelete === 'SET DEFAULT') {
                await query.patchMany({ [property.name]: property.getDefaultValue() });
            }
        }
    }

    async onUoWDelete(event: UnitOfWorkEvent<any>) {
        const references = this.resolveReferencesTo(event.classSchema);
        if (!references.length) return;

        for (const { classSchema, property } of references) {
            const query = event.databaseSession.query(classSchema).filter({ [property.name]: { $in: event.items } });
            const options = property.getReference()!;

            if (options.onDelete === undefined || options.onDelete === 'CASCADE') {
                await query.deleteMany();
            } else if (options.onDelete === 'SET NULL') {
                await query.patchMany({ [property.name]: null });
            } else if (options.onDelete === 'SET DEFAULT') {
                await query.patchMany({ [property.name]: property.getDefaultValue() });
            }
            //RESTRICT needs to be handled in Pre
        }
    }

    async onUoWUpdate(event: UnitOfWorkUpdateEvent<any>) {
        const references = this.resolveReferencesTo(event.classSchema);
        if (!references.length) return;

        const primaryKeys: { oldPK: any, newPK: any }[] = [];

        const primaryKeyName = event.classSchema.getPrimary().name;
        for (const changeSet of event.changeSets) {
            if (changeSet.changes.has(primaryKeyName)) {
                primaryKeys.push({
                    oldPK: changeSet.primaryKey[primaryKeyName],
                    newPK: changeSet.item.primaryKey[primaryKeyName],
                });
            }
        }

        for (const { classSchema, property } of references) {
            for (const { oldPK, newPK } of primaryKeys) {
                const query = await event.databaseSession.query(classSchema).filter({ [property.name]: oldPK });
                const options = property.getReference()!;

                if (options.onDelete === undefined || options.onDelete === 'CASCADE') {
                    await query.patchMany({ [property.name]: newPK });
                } else if (options.onDelete === 'SET NULL') {
                    await query.patchMany({ [property.name]: null });
                } else if (options.onDelete === 'SET DEFAULT') {
                    await query.patchMany({ [property.name]: property.getDefaultValue() });
                }
            }
            //RESTRICT needs to be handled in Pre
        }
    }
}
