/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { DatabaseAdapter, DatabaseDeleteError, DatabasePatchError, DatabaseSession, DeleteResult, Formatter, GenericQueryResolver, OrmEntity, PatchResult, QueryExplainOp } from '@deepkit/orm';
import { Changes, getPartialSerializeFunction, getPatchSerializeFunction, PrimaryKeyFields, ReflectionClass, ReflectionKind, ReflectionVisibility, resolveForeignReflectionClass, serializer, typeOf } from '@deepkit/type';
import { MongoClient } from './client/client.js';
import { AggregateCommand } from './client/command/aggregate.js';
import { CountCommand } from './client/command/count.js';
import { DeleteCommand } from './client/command/delete.js';
import { FindCommand } from './client/command/find.js';
import { FindAndModifyCommand } from './client/command/findAndModify.js';
import { UpdateCommand } from './client/command/update.js';
import { convertClassQueryToMongo } from './mapping.js';
import { DEEP_SORT, FilterQuery, MongoQueryModel } from './query.model.js';
import { MongoConnection } from './client/connection.js';
import { MongoDatabaseAdapter, MongoExplainVerbosity } from './adapter.js';
import { empty, formatError } from '@deepkit/core';
import { mongoSerializer } from './mongo-serializer.js';
import { handleSpecificError } from './error.js';
import { ExplainCommand, MongoExplain } from './client/command/explain.js';

export function getMongoFilter<T extends OrmEntity>(classSchema: ReflectionClass<T>, model: MongoQueryModel<T>): any {
    return convertClassQueryToMongo(classSchema, (model.filter || {}) as FilterQuery<T>, {}, {
        $parameter: (name, value) => {
            if (undefined === model.parameters[value]) {
                throw new Error(`Parameter ${value} not defined in ${classSchema.getClassName()} query.`);
            }
            return model.parameters[value];
        },
        $like: (name, value) => {
            const regexp = ('^' + value + '$').replace(/%/g, '.*').replace(/_/g, '.');
            return new RegExp(regexp, 'i');
        },
    });
}

interface CountSchema {
    count: number;
}

export class MongoQueryResolver<T extends OrmEntity> extends GenericQueryResolver<T, DatabaseAdapter, MongoQueryModel<T>> {
    protected countSchema = ReflectionClass.from(typeOf<CountSchema>());

    constructor(
        classSchema: ReflectionClass<T>,
        protected session: DatabaseSession<MongoDatabaseAdapter>,
        protected client: MongoClient,
    ) {
        super(classSchema, session);
    }

    async has(model: MongoQueryModel<T>): Promise<boolean> {
        return await this.count(model) > 0;
    }

    async explain(model: MongoQueryModel<T>, op: QueryExplainOp, option: MongoExplainVerbosity = 'allPlansExecution'): Promise<MongoExplain> {
        const command = this.getExplainCommand(model, op, option);
        return await this.client.execute(command, model.getCommandOptions(), this.session.assignedTransaction);
    }

    protected getExplainCommand(model: MongoQueryModel<T>, op: QueryExplainOp, verbosity: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): ExplainCommand {
        switch (op) {
            case 'findOne':
            case 'find': {
                return new ExplainCommand(this.createFindCommand(model, false), verbosity);
            }
            case 'count':
                return new ExplainCommand(this.getCountCommand(model), verbosity);
            case 'patch':
                return new ExplainCommand(this.getPatchCommand(model, new Changes<T>(), getMongoFilter(this.classSchema, model)), verbosity);
            case 'delete':
                throw new Error('Explain operation delete not supported for MongoDB yet.');
        }
        throw new Error(`Explain operation ${op} not supported for MongoDB.`);
    }

    handleSpecificError(error: Error): Error {
        return handleSpecificError(this.session, error);
    }

    protected getPrimaryKeysProjection(classSchema: ReflectionClass<any>) {
        const pk: { [name: string]: 1 | 0 } = { _id: 0 };
        for (const property of classSchema.getPrimaries()) {
            pk[property.name] = 1;
        }
        return pk;
    }

    protected async fetchIds(queryModel: MongoQueryModel<T>, limit: number = 0, connection: MongoConnection): Promise<PrimaryKeyFields<any>[]> {
        const primaryKeyName = this.classSchema.getPrimary().name;
        const projection = { [primaryKeyName]: 1 as const };

        if (queryModel.hasJoins()) {
            const pipeline = this.buildAggregationPipeline(queryModel);
            if (limit) pipeline.push({ $limit: limit });
            pipeline.push({ $project: projection });
            const command = new AggregateCommand(this.classSchema, pipeline);
            command.options = queryModel.getCommandOptions();
            command.partial = true;
            return await connection.execute(command);
        } else {
            const mongoFilter = getMongoFilter(this.classSchema, queryModel);
            const command = new FindCommand(this.classSchema, mongoFilter, projection, this.getSortFromModel(queryModel.sort), limit || queryModel.limit, queryModel.skip);
            command.options = queryModel.getCommandOptions();
            return await connection.execute(command);
        }
    }

    /**
     * The delete command only has a filter and a limit of 0 or 1. Everything else needs the keys first.
     */
    protected isDeletableByFilter(queryModel: MongoQueryModel<T>): boolean {
        if (queryModel.hasJoins() || queryModel.skip) return false;
        if (!queryModel.limit) return true;
        return queryModel.limit === 1 && !queryModel.hasSort();
    }

    public async delete(queryModel: MongoQueryModel<T>, deleteResult: DeleteResult<T>): Promise<void> {
        const connection = await this.client.getConnection(queryModel.getCommandOptions(), this.session.assignedTransaction);

        try {
            if (!deleteResult.shouldLoadPrimaryKeys && this.isDeletableByFilter(queryModel)) {
                const command = new DeleteCommand(this.classSchema, getMongoFilter(this.classSchema, queryModel) || {}, queryModel.limit);
                command.options = queryModel.getCommandOptions();
                deleteResult.modified = await connection.execute(command);
                return;
            }

            const primaryKeys = await this.fetchIds(queryModel, queryModel.limit, connection);
            if (primaryKeys.length === 0) return;
            deleteResult.modified = primaryKeys.length;
            for (const primaryKey of primaryKeys) deleteResult.addPrimaryKey(primaryKey);
            const primaryKeyName = this.classSchema.getPrimary().name;

            const query = convertClassQueryToMongo(this.classSchema, { [primaryKeyName]: { $in: primaryKeys.map(v => v[primaryKeyName]) } } as FilterQuery<T>);
            // no limit: the filter matches exactly the fetched items, and MongoDB only accepts a limit of 0 or 1
            const command = new DeleteCommand(this.classSchema, query);
            command.options = queryModel.getCommandOptions();
            await connection.execute(command);
        } catch (error: any) {
            error = new DatabaseDeleteError(this.classSchema, `Could not delete ${this.classSchema.getClassName()} in database: ${formatError(error)}`, { cause: error });
            error.query = queryModel;
            throw this.handleSpecificError(error);
        } finally {
            connection.release();
        }
    }

    protected getPatchCommand(model: MongoQueryModel<T>, changes: Changes<T>, filter: any) {
        const patchSerialize = getPatchSerializeFunction(this.classSchema.type, mongoSerializer.serializeRegistry);

        const u: any = {};
        if (changes.$set) u.$set = changes.$set;
        if (changes.$unset) u.$unset = changes.$unset;
        if (changes.$inc) u.$inc = changes.$inc;

        if (u.$set) {
            u.$set = patchSerialize(u.$set);
        }

        if (model.limit === 1) {
            const command = new FindAndModifyCommand(
                this.classSchema,
                filter,
                u,
            );
            command.options = model.getCommandOptions();
            command.returnNew = true;
            return command;
        }

        const command = new UpdateCommand(this.classSchema, [{
            q: filter,
            u: u,
            multi: !model.limit,
        }]);

        command.options = model.getCommandOptions();
        return command;
    }

    public async patch(model: MongoQueryModel<T>, changes: Changes<T>, patchResult: PatchResult<T>): Promise<void> {
        const filter = getMongoFilter(this.classSchema, model) || {};
        const command = this.getPatchCommand(model, changes, filter);

        if (model.hasJoins()) {
            throw new Error('Not implemented: Use aggregate to retrieve ids, then do the query');
        }

        const partialDeserialize = getPartialSerializeFunction(this.classSchema.type, serializer.deserializeRegistry);

        const primaryKeyName = this.classSchema.getPrimary().name;

        const returning = new Set([...model.returning, ...changes.getReturning()]);

        const connection = await this.client.getConnection(model.getCommandOptions(), this.session.assignedTransaction);

        try {
            if (command instanceof FindAndModifyCommand) {
                command.fields = [primaryKeyName, ...returning];
                const res = await connection.execute(command);
                patchResult.modified = res.value ? 1 : 0;

                if (res.value) {
                    const converted = partialDeserialize(res.value) as any;
                    patchResult.primaryKeys = [converted];
                    for (const name of returning) {
                        patchResult.returning[name] = [converted[name]];
                    }
                }
                return;
            }

            patchResult.modified = await connection.execute(command);

            const projection: { [name: string]: 1 | 0 } = {};
            projection[primaryKeyName] = 1;
            for (const name of returning) {
                projection[name] = 1;
                patchResult.returning[name] = [];
            }

            const findCommand = new FindCommand(this.classSchema, filter, projection, {}, model.limit, model.skip);
            findCommand.options = model.getCommandOptions();
            const items = await connection.execute(findCommand);
            for (const item of items) {
                const converted = partialDeserialize(item);
                patchResult.primaryKeys.push(converted);
                for (const name of returning) {
                    patchResult.returning[name].push(converted[name]);
                }
            }
        } catch (error: any) {
            error = new DatabasePatchError(this.classSchema, model, changes, `Could not patch ${this.classSchema.getClassName()} in database`, { cause: error });
            throw this.handleSpecificError(error);
        } finally {
            connection.release();
        }
    }

    protected getCountCommand(queryModel: MongoQueryModel<T>) {
        if (queryModel.hasJoins() || this.session.assignedTransaction) {
            const pipeline = this.buildAggregationPipeline(queryModel);
            pipeline.push({ $count: 'count' });
            const command = new AggregateCommand<any, CountSchema>(this.classSchema, pipeline, this.countSchema);
            command.options = queryModel.getCommandOptions();
            return command;
        }

        const query = getMongoFilter(this.classSchema, queryModel);
        if (!queryModel.getCommandOptions().estimateCount && empty(query)) {
            //when a query is empty, mongo returns an estimated count from meta-data.
            //we don't want estimates, we want deterministic results, so we add a query
            const primaryKey = this.classSchema.getPrimary().name;
            query[primaryKey] = { $nin: [] };
        }
        const command = new CountCommand(
            this.classSchema,
            query,
            queryModel.limit,
            queryModel.skip,
        );
        command.options = queryModel.getCommandOptions();
        return command;
    }

    public async count(queryModel: MongoQueryModel<T>) {
        const command = this.getCountCommand(queryModel);
        const connection = await this.client.getConnection(queryModel.getCommandOptions(), this.session.assignedTransaction);
        try {
            //count command is not supported for transactions
            if (command instanceof AggregateCommand) {
                const items = await connection.execute(command);
                return items.length ? items[0].count : 0;
            } else {
                return await connection.execute(command);
            }
        } finally {
            connection.release();
        }
    }

    protected getSchemaWithJoins(): ReflectionClass<any> {
        const jit = this.classSchema.getJitContainer();
        if (jit.ormMongoSchemaWithJoins) return jit.ormMongoSchemaWithJoins;

        const schema = this.classSchema.clone();

        for (const property of schema.getProperties().slice()) {
            if (property.isReference() || property.isBackReference()) {
                const name = '__ref_' + property.name;
                schema.addProperty({
                    name,
                    type: { kind: ReflectionKind.any },
                    visibility: ReflectionVisibility.public,
                });
            }
        }

        return jit.ormMongoSchemaWithJoins = schema;
    }

    public async findOneOrUndefined(model: MongoQueryModel<T>): Promise<T | undefined> {
        const connection = await this.client.getConnection(model.getCommandOptions(), this.session.assignedTransaction);

        const command = this.createFindCommand(model, true);

        try {
            const items = await connection.execute(command);
            if (model.isAggregate()) {
                return items[0] as T;
            }

            if (items.length) {
                const formatter = this.createFormatter(model.withIdentityMap);
                return formatter.hydrate(model, items[0]);
            }
            return;
        } finally {
            connection.release();
        }
    }

    public async find(model: MongoQueryModel<T>): Promise<T[]> {
        const formatter = this.createFormatter(model.withIdentityMap);

        const command = this.createFindCommand(model, false);
        const connection = await this.client.getConnection(model.getCommandOptions(), this.session.assignedTransaction);

        try {
            const items = await connection.execute(command);
            if (model.isAggregate()) {
                return items as T[];
            }
            return items.map(v => formatter.hydrate(model, v));
        } finally {
            connection.release();
        }
    }

    protected createFindCommand(model: MongoQueryModel<T>, findOne: boolean): FindCommand<T> | AggregateCommand<T> {
        if (model.hasJoins() || model.isAggregate()) {
            const pipeline = this.buildAggregationPipeline(model);
            if (findOne) {
                pipeline.push({ $limit: 1 });
            }
            const resultsSchema = model.isAggregate() ? this.getCachedAggregationSchema(model) : this.getSchemaWithJoins();
            const command = new AggregateCommand<T>(this.classSchema, pipeline, resultsSchema);
            command.partial = model.isPartial();
            command.options = model.getCommandOptions();
            return command;
        }

        const command = new FindCommand<T>(
            this.classSchema,
            getMongoFilter(this.classSchema, model),
            this.getProjection(this.classSchema, model.select),
            this.getSortFromModel(model.sort),
            model.limit,
            model.skip,
        );
        command.options = model.getCommandOptions();
        return command;
    }

    protected getCachedAggregationSchema(model: MongoQueryModel<T>): ReflectionClass<any> {
        const jit = this.classSchema.getJitContainer();
        const keys: string[] = [...model.groupBy.values()];
        for (const [g, a] of model.aggregate.entries()) {
            keys.push(g + ':' + a.func);
        }

        const cacheKey = 'ormMongoAggregation' + keys.join('/');
        if (jit[cacheKey]) return jit[cacheKey];

        const schema = this.getSchemaWithJoins().clone();
        for (const g of model.groupBy.values()) {
            schema.addProperty({
                name: g,
                type: { kind: ReflectionKind.any },
                visibility: ReflectionVisibility.public,
            });
        }
        for (const g of model.aggregate.keys()) {
            schema.addProperty({
                name: g,
                type: { kind: ReflectionKind.any },
                visibility: ReflectionVisibility.public,
            });
        }

        return jit[cacheKey] = schema;
    }

    protected buildAggregationPipeline(model: MongoQueryModel<T>) {
        const joinRefs: string[] = [];
        const handleJoins = <T extends OrmEntity>(pipeline: any[], query: MongoQueryModel<T>, schema: ReflectionClass<any>) => {
            for (const join of query.joins) {
                //refs are deserialized as `any` and then further deserialized using the default serializer
                join.as = '__ref_' + join.propertySchema.name;
                joinRefs.push(join.as);

                const foreignSchema = resolveForeignReflectionClass(join.propertySchema);
                const joinPipeline: any[] = [];

                if (join.propertySchema.isBackReference()) {
                    if (join.propertySchema.getBackReference().via) {
                    } else {
                        const backReference = foreignSchema.findReverseReference(
                            join.classSchema.getClassType(),
                            join.propertySchema,
                        );

                        joinPipeline.push({
                            $match: { $expr: { $eq: ['$' + backReference.getForeignKeyName(), '$$foreign_id'] } },
                        });
                    }
                } else {
                    joinPipeline.push({
                        $match: { $expr: { $eq: ['$' + join.foreignPrimaryKey.name, '$$foreign_id'] } },
                    });
                }

                if (join.query.model.hasJoins()) {
                    handleJoins(joinPipeline, join.query.model as MongoQueryModel<any>, foreignSchema);
                }

                if (join.query.model.filter) joinPipeline.push({ $match: getMongoFilter(join.query.classSchema, join.query.model as MongoQueryModel<any>) });
                if (join.query.model.sort) joinPipeline.push({ $sort: this.getSortFromModel(join.query.model.sort) });
                if (join.query.model.skip) joinPipeline.push({ $skip: join.query.model.skip });
                if (join.query.model.limit) joinPipeline.push({ $limit: join.query.model.limit });

                if (join.populate) {
                    const projection = this.getProjection(join.query.classSchema, join.query.model.select);
                    // if (!join.classSchema.hasProperty('_id') || (join.query.model.isPartial() && !join.query.model.isSelected('_id'))) {
                    //     project['_id'] = 0;
                    // }
                    if (projection) joinPipeline.push({ $project: projection });
                } else {
                    //not populated, so only fetch primary key.
                    const projection = this.getPrimaryKeysProjection(foreignSchema);
                    joinPipeline.push({ $project: projection });
                }

                if (join.propertySchema.isBackReference()) {
                    if (join.propertySchema.getBackReference().via) {
                        //many-to-many
                        const viaClassSchema = ReflectionClass.from(join.propertySchema.getBackReference().via);
                        const subAs = join.propertySchema.name;

                        const backReference = viaClassSchema.findReverseReference(
                            join.classSchema.getClassType(),
                            join.propertySchema,
                            //mappedBy is not for pivot tables. We would need 2 different mappedBy
                            // join.propertySchema.backReference.mappedBy as string
                        );

                        pipeline.push({
                            $lookup: {
                                from: this.client.resolveCollectionName(viaClassSchema),
                                let: { localField: '$' + join.classSchema.getPrimary().name },
                                pipeline: [
                                    { $match: { $expr: { $eq: ['$' + backReference.getForeignKeyName(), '$$localField'] } } },
                                ],
                                as: subAs,
                            },
                        });

                        const foreignSchema = resolveForeignReflectionClass(join.propertySchema);
                        const backReferenceForward = viaClassSchema.findReverseReference(
                            foreignSchema.getClassType(),
                            join.propertySchema,
                            //mappedBy is not for pivot tables. We would need 2 different mappedBy
                            // join.propertySchema.backReference.mappedBy as string
                        );

                        pipeline.push({
                            $addFields: { [subAs]: '$' + subAs + '.' + backReferenceForward.getForeignKeyName() },
                        });

                        pipeline.push({
                            $lookup: {
                                from: this.client.resolveCollectionName(foreignSchema),
                                let: { localField: '$' + subAs },
                                pipeline: [
                                    { $match: { $expr: { $in: ['$' + foreignSchema.getPrimary().name, '$$localField'] } } },
                                ].concat(joinPipeline),
                                as: join.as,
                            },
                        });

                        //important to unset the actual property in the database since its type is incompatible with the declared type in TS. (foreign key vs objects)
                        pipeline.push({
                            $unset: [join.propertySchema.name],
                        });
                    } else {
                        //one-to-many
                        pipeline.push({
                            $lookup: {
                                from: this.client.resolveCollectionName(foreignSchema),
                                let: { foreign_id: '$' + join.classSchema.getPrimary().name },
                                pipeline: joinPipeline,
                                as: join.as,
                            },
                        });
                    }
                } else {
                    pipeline.push({
                        $lookup: {
                            from: this.client.resolveCollectionName(foreignSchema),
                            let: { foreign_id: '$' + join.propertySchema.getForeignKeyName() },
                            pipeline: joinPipeline,
                            as: join.as,
                        },
                    });
                }

                if (join.propertySchema.isArray()) {
                    if (join.type === 'inner') {
                        pipeline.push({
                            $match: { [join.as]: { $ne: [] } },
                        });
                    }
                } else {
                    //for *toOne relations, since mongodb joins always as array
                    pipeline.push({
                        $unwind: {
                            path: '$' + join.as,
                            preserveNullAndEmptyArrays: join.type === 'left',
                        },
                    });
                }
            }
        };

        const pipeline: any[] = [];

        handleJoins(pipeline, model, this.classSchema);

        if (model.filter) pipeline.push({ $match: getMongoFilter(this.classSchema, model) });

        if (model.isAggregate()) {
            const group: any = { _id: {} };
            const project: any = {};
            const unset: string[] = [];
            for (const g of model.groupBy.values()) {
                group._id[g] = '$' + g;
                //mongo pushes the result of the groupBy into _id event if the value has absolutely nothing to do with the _id type
                //we have in the schema. Thus, we need to make sure it is not part of the result set.
                if (g !== '_id') unset.push('_id');
                project[g] = '$_id.' + g;
            }

            for (const [as, a] of model.aggregate.entries()) {
                if (a.func === 'sum') {
                    group[as] = { $sum: '$' + a.property.name };
                } else if (a.func === 'min') {
                    group[as] = { $min: '$' + a.property.name };
                } else if (a.func === 'max') {
                    group[as] = { $max: '$' + a.property.name };
                } else if (a.func === 'avg') {
                    group[as] = { $avg: '$' + a.property.name };
                } else if (a.func === 'count') {
                    group[as] = { $sum: 1 };
                } else if (a.func === 'group_concat') {
                    group[as] = { $push: '$' + a.property.name };
                }

                project[as] = 1;
            }

            pipeline.push({ $group: group });
            pipeline.push({ $project: project });
            if (unset.length) pipeline.push({ $unset: unset });
        }

        if (model.sort) pipeline.push({ $sort: this.getSortFromModel(model.sort) });
        if (model.skip) pipeline.push({ $skip: model.skip });
        if (model.limit) pipeline.push({ $limit: model.limit });

        if (!model.isAggregate()) {
            const projection = this.getProjection(this.classSchema, model.select);
            if (projection) {
                for (const name of joinRefs) {
                    (projection as any)[name] = 1;
                }
            }
            if (projection) pipeline.push({ $project: projection });
        }

        return pipeline;
    }

    /**
     * Returns undefined when no selection limitation has happened. When non-undefined
     * the mongo driver returns a t.partial.
     */
    protected getProjection<T>(classSchema: ReflectionClass<any>, select: Set<string>): { [name: string]: 0 | 1 } | undefined {
        const res: { [name: string]: 0 | 1 } = {};

        //as soon as we provide a {} to find/aggregate command, it triggers t.partial()
        if (select.size) {
            res['_id'] = 0;
            for (const v of select.values()) {
                (res as any)[v] = 1;
            }
            // for (const property of this.classSchema.getPrimaries()) {
            //     (res as any)[property.name] = 1;
            // }
            return res;
        } else {
            // for (const v of classSchema.getPropertiesMap().keys()) {
            //     (res as any)[v] = 1;
            // }
            return undefined;
        }
    }

    protected createFormatter(withIdentityMap: boolean = false) {
        return new Formatter(
            this.classSchema,
            serializer,
            this.session.getHydrator(),
            withIdentityMap ? this.session.identityMap : undefined,
        );
    }

    protected getSortFromModel<T extends OrmEntity>(modelSort?: DEEP_SORT<T>) {
        const sort: { [name: string]: -1 | 1 | { $meta: 'textScore' } } = {};
        if (modelSort) {
            for (const [i, v] of Object.entries(modelSort)) {
                sort[i] = v === 'asc' ? 1 : (v === 'desc' ? -1 : v);
            }
        }
        return sort;
    }
}
