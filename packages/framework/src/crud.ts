import { ClassType, getObjectKeysSize, isArray } from '@deepkit/core';
import { AppModule } from '@deepkit/app';
import { http, HttpBody, httpClass, HttpPath, HttpQueries, JSONResponse } from '@deepkit/http';
import { Database, DatabaseRegistry, Query, UniqueConstraintFailure } from '@deepkit/orm';
import {
    InlineRuntimeType,
    Maximum,
    Positive,
    ReflectionClass,
    ReflectionKind,
    Type,
    TypeUnion,
    ValidationError,
} from '@deepkit/type';

function applySelect(query: Query<any>, select: string[] | string): Query<any> {
    const names: string[] = isArray(select) ? select.map(v => v.trim()) : select.replace(/\s+/g, '').split(',');
    try {
        return query.select(...names);
    } catch (error: any) {
        throw ValidationError.from([{ message: String(error.message), path: 'select', code: 'invalid_select' }]);
    }
}

function applyJoins(query: Query<any>, joins: { [name: string]: string }): Query<any> {
    for (const [field, projection] of Object.entries(joins)) {
        if (!query.classSchema.hasProperty(field)) throw new Error(`Join '${field}' does not exist`);
        let join = query.useJoinWith(field);
        if (projection.length && projection !== '*') {
            join = join.select(...projection.split(','));
        }
        query = join.end();
    }

    return query;
}

interface AutoCrudOptions {
    /**
     * To limit the route generation to a subset of operations, specify an array of
     * 'create' | 'read' | 'readMany' | 'update' | 'updateMany' | 'delete' | 'deleteMany'.
     *
     * ```typescript
     *  {limitOperations: ['create', 'read', 'readMany']}
     * ```
     */
    limitOperations?: ('create' | 'read' | 'readMany' | 'update' | 'updateMany' | 'delete' | 'deleteMany')[];

    /**
     * Defaults to the primary key.
     * If you have an additional unique field, you can specify here its name.
     */
    identifier?: string;

    /**
     * Per default all fields are selectable in list/get routes.
     *
     * Specify each field to limit the selection.
     */
    selectableFields?: string[];

    /**
     * Per default all fields are sortable in list/get routes.
     *
     * Specify each field to limit the selection.
     */
    sortFields?: string[];

    /**
     * Per default the identifier/primary key can not be changed.
     *
     * Set this to true to allow it.
     */
    identifierChangeable?: true;

    /**
     * Per default all joins are selectable in list/get routes.
     *
     * Specify each field to limit the selection.
     */
    joins?: string[];

    /**
     * Per default max is 1000.
     */
    maxLimit?: number;

    /**
     * Per default limit is 30.
     */
    defaultLimit?: number;
}

function createController(schema: ReflectionClass<any>, options: AutoCrudOptions = {}): ClassType {
    if (!schema.name) throw new Error(`Class ${schema.getClassName()} needs an entity name via @entity.name()`);

    const joinNames: string[] = options.joins || schema.getProperties().filter(v => v.isReference() || v.isBackReference()).map(v => v.name);
    const sortNames: string[] = options.sortFields || schema.getProperties().filter(v => !v.isReference() && !v.isBackReference()).map(v => v.name);
    const selectNames: string[] = options.selectableFields || schema.getProperties().filter(v => !v.isReference() && !v.isBackReference()).map(v => v.name);

    const joinNamesType: TypeUnion = { kind: ReflectionKind.union, types: joinNames.map(v => ({ kind: ReflectionKind.literal, literal: v })) };
    const sortNamesType: TypeUnion = { kind: ReflectionKind.union, types: sortNames.map(v => ({ kind: ReflectionKind.literal, literal: v })) };
    const selectNamesType: TypeUnion = { kind: ReflectionKind.union, types: selectNames.map(v => ({ kind: ReflectionKind.literal, literal: v })) };

    type JoinNames = InlineRuntimeType<typeof joinNamesType>;
    type SortNames = InlineRuntimeType<typeof sortNamesType>;
    type SelectNames = InlineRuntimeType<typeof selectNamesType>;

    //note: only shallows clone (including members shallow copy)
    const selectSchema = schema.clone();
    //make sure references are `PrimaryKey<T> | T`
    for (const property of selectSchema.getProperties().slice()) {
        if ((property.isReference() || property.isBackReference()) && !property.isArray()) {
            selectSchema.removeProperty(property.name);
            const foreign = property.getResolvedReflectionClass();
            selectSchema.addProperty({
                ...property.property,
                type: { kind: ReflectionKind.union, types: [foreign.getPrimary().type, property.type] }
            });
        }
    }
    type SchemaType = InlineRuntimeType<typeof selectSchema>;

    const identifier = options.identifier ? schema.getProperty(options.identifier) : schema.getPrimary();
    const identifierType = identifier.type;
    type IdentifierType = InlineRuntimeType<typeof identifierType>
    // the route has the identifier's name (:username), the method parameter is called id
    const identifierName: Type = { kind: ReflectionKind.literal, literal: identifier.name };
    type IdentifierPath = HttpPath<IdentifierType, { name: InlineRuntimeType<typeof identifierName> }>;

    const maxLimit = options.maxLimit || 1000;

    interface ListQuery {
        filter?: Partial<SchemaType>;
        /**
         * @description List of or string of comma separated field names
         */
        select?: SelectNames[] | string;
        orderBy?: { [name in SortNames]?: 'asc' | 'desc' };
        /**
         * @description Each entry with field names, comma separated, or all with '*'.
         */
        joins?: { [name in JoinNames]?: string };
        offset?: number & Positive;
        limit?: number & Positive & Maximum<InlineRuntimeType<typeof maxLimit>>;
    }

    interface GetQuery {
        /**
         * @description List of or string of comma separated field names.
         */
        select?: SelectNames[] | string;
        joins?: { [name in JoinNames]?: string };
    }

    interface ErrorMessage {
        message: string;
    }

    const identifierChangeable = options && options.identifierChangeable ? true : false;

    @(http.controller('/entity/' + schema.name).group('crud'))
    class RestController {
        constructor(protected registry: DatabaseRegistry) {
        }

        protected getDatabase(): Database {
            return this.registry.getDatabaseForEntity(schema);
        }

        @(http.GET('')
            .description(`A list of ${schema.name}.`)
            .response<SchemaType[]>(200, `List of ${schema.name}.`)
            .response<ValidationError>(400, `When parameter validation failed.`))
        async readMany(listQuery: HttpQueries<ListQuery>) {
            listQuery.limit = Math.min(options.maxLimit || 1000, listQuery.limit || options.defaultLimit || 30);
            let query = this.getDatabase().query(schema);

            if (listQuery.joins) query = applyJoins(query, listQuery.joins as any);
            if (listQuery.select) query = applySelect(query, listQuery.select);

            if (listQuery.orderBy && getObjectKeysSize(listQuery.orderBy) > 0) {
                for (const field of Object.keys(listQuery.orderBy)) {
                    if (!schema.hasProperty(field)) throw new Error(`Can not order by '${field}' since it does not exist.`);
                }
                query.model.sort = listQuery.orderBy;
            }

            return await query
                .filter(listQuery.filter)
                .limit(listQuery.limit ? listQuery.limit : undefined)
                .skip(listQuery.offset)
                .find();
        }

        @(http.POST('')
            .description(`Add a new ${schema.name}.`)
            .response<SchemaType>(201, 'When successfully created.')
            .response<ValidationError>(400, `When parameter validation failed`)
            .response<ErrorMessage>(409, 'When unique entity already exists.'))
        async create(body: HttpBody<SchemaType>) {
            //body is automatically validated
            //is cast really necessary?
            // const item = cast(body, undefined, undefined, schema.type);
            const item = body;
            try {
                await this.getDatabase().persist(item);
            } catch (e) {
                if (e instanceof UniqueConstraintFailure) {
                    return new JSONResponse({ message: `This ${schema.name} already exists` }).status(409);
                }
                throw e;
            }
            return new JSONResponse(item).status(201);
        }

        @(http.DELETE(':' + identifier.name)
            .description(`Delete a single ${schema.name}.`)
            .response<ValidationError>(400, `When parameter validation failed`)
            .response<{ deleted: number }>(200, `When deletion was successful`))
        async delete(id: IdentifierPath) {
            const result = await this.getDatabase().query(schema).filter({ [identifier.name]: id }).deleteOne();
            return { deleted: result.modified };
        }

        @(http.GET(':' + identifier.name)
            .description(`Get a single ${schema.name}.`)
            .response<SchemaType>(200, `When ${schema.name} was found.`)
            .response<ValidationError>(400, `When parameter validation failed`)
            .response<ErrorMessage>(404, `When ${schema.name} was not found.`))
        async read(
            id: IdentifierPath,
            options: HttpQueries<GetQuery>
        ) {
            let query = this.getDatabase().query(schema).filter({ [identifier.name]: id });
            if (options.select) query = applySelect(query, options.select);
            if (options.joins) query = applyJoins(query, options.joins as any);

            const item = await query.findOneOrUndefined();
            if (item) return item;

            return new JSONResponse({ message: `${schema.name} not found` }).status(404);
        }

        @(http.PUT(':' + identifier.name)
            .description(`Update a single ${schema.name}.`)
            .response<SchemaType>(200, `When ${schema.name} was successfully updated.`)
            .response<ValidationError>(400, `When parameter validation failed`)
            .response<ErrorMessage>(404, `When ${schema.name} was not found.`))
        async update(
            id: IdentifierPath,
            body: HttpBody<Partial<SchemaType>>,
        ) {
            let query = this.getDatabase().query(schema).filter({ [identifier.name]: id });

            const item = await query.findOneOrUndefined();
            if (!item) return new JSONResponse({ message: `${schema.name} not found` }).status(404);

            if (!identifierChangeable && identifier.name in body) delete body[identifier.name];

            Object.assign(item, body);
            await this.getDatabase().persist(item);
            return item;
        }
    }

    Object.defineProperty(RestController, 'name', { value: 'RestController' + schema.getClassName() });

    if (options.limitOperations) {
        const data = httpClass._fetch(RestController);
        if (!data) throw new Error('httpClass has no RestController');

        for (const action of data.actions) {
            if (!options.limitOperations.includes(action.methodName as any)) {
                data.removeAction(action.methodName);
            }
        }
    }

    return RestController;
}

export class CrudAppModule<T extends {}> extends AppModule<T> {
}

/**
 * Create a module that provides CRUD routes for given entities.
 */
export function createCrudRoutes(schemas: (ClassType | ReflectionClass<any>)[], options: AutoCrudOptions = {}) {
    const controllers = schemas.map(v => ReflectionClass.from(v)).map(v => createController(v, options));

    return new CrudAppModule({}, {
        name: 'autoCrud',
        controllers: controllers
    });
}
