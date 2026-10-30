import { isArray, isObject } from '@deepkit/core';
import { Database, DatabaseAdapter, MigrateOptions } from '@deepkit/orm';
import {
    BrowserControllerInterface,
    DatabaseCommit,
    DatabaseInfo,
    QueryResult,
} from '@deepkit/orm-browser-api';
import { rpc } from '@deepkit/rpc';
import { SQLDatabaseAdapter } from '@deepkit/sql';
import { Logger, MemoryLoggerTransport } from '@deepkit/logger';
import { performance } from 'perf_hooks';
import { http, HttpQuery } from '@deepkit/http';
import {
    cast,
    getPartialSerializeFunction,
    ReflectionClass,
    serializer,
} from '@deepkit/type';

@rpc.controller(BrowserControllerInterface)
export class OrmBrowserController implements BrowserControllerInterface {
    constructor(protected databases: Database[]) {
    }

    public registerDatabase(...databases: Database[]) {
        this.databases.push(...databases);
    }

    protected extractDatabaseInfo(db: Database): DatabaseInfo {
        return new DatabaseInfo(db.name, (db.adapter as DatabaseAdapter).getName(), db.entityRegistry.all().map(v => v.serializeType()));
    }

    protected getDb(dbName: string): Database {
        for (const db of this.databases) {
            if (db.name === dbName) return db;
        }
        throw new Error(`No database ${dbName} found`);
    }

    protected getDbEntity(dbName: string, entityName: string): [Database, ReflectionClass<any>] {
        for (const db of this.databases) {
            if (db.name === dbName) {
                for (const entity of db.entityRegistry.all()) {
                    if (entity.name === entityName) return [db, entity];
                }
            }
        }

        throw new Error(`No entity ${entityName} for in database ${dbName}`);
    }

    @rpc.action()
    getDatabases(): DatabaseInfo[] {
        const databases: DatabaseInfo[] = [];

        for (const db of this.databases) {
            databases.push(this.extractDatabaseInfo(db));
        }

        return databases;
    }

    @rpc.action()
    getDatabase(name: string): DatabaseInfo {
        for (const db of this.databases) {
            if (db.name === name) return this.extractDatabaseInfo(db);
        }

        throw new Error(`No database ${name} found`);
    }

    protected findDatabase(name: string): Database {
        for (const db of this.databases) {
            if (db.name === name) return db;
        }

        throw new Error(`No database ${name} found`);
    }

    @rpc.action()
    async migrate(name: string): Promise<void> {
        const db = this.findDatabase(name);
        await db.migrate();
    }

    @rpc.action()
    async resetAllTables(name: string): Promise<void> {
        const db = this.findDatabase(name);
        if (db.adapter instanceof SQLDatabaseAdapter) {
            await db.adapter.createTables(db.entityRegistry);
        }
    }

    @rpc.action()
    async getMigrations(name: string): Promise<{ [name: string]: { sql: string[], diff: string } }> {
        const db = this.findDatabase(name);
        if (db.adapter instanceof SQLDatabaseAdapter) {
            return db.adapter.getMigrations(new MigrateOptions(), db.entityRegistry);
        }
        return {};
    }

    @http.GET('_orm-browser/query')
    async httpQuery(dbName: HttpQuery<string>, entityName: HttpQuery<string>, query: HttpQuery<string>): Promise<QueryResult> {
        const [, entity] = this.getDbEntity(dbName, entityName);
        const res = await this.query(dbName, entityName, query);
        if (isArray(res.result)) {
            const partial = getPartialSerializeFunction(entity.type, serializer.deserializeRegistry);
            res.result = res.result.map(v => partial(v));
        }
        return res;
    }

    @rpc.action()
    async query(dbName: string, entityName: string, query: string): Promise<QueryResult> {
        const res: QueryResult = {
            executionTime: 0,
            log: [],
            result: undefined
        };

        const [db, entity] = this.getDbEntity(dbName, entityName);
        const oldLogger = db.logger;
        const loggerTransport = new MemoryLoggerTransport;
        db.setLogger(new Logger([loggerTransport]));

        try {
            const fn = new Function(`return function(database, ${entity.getClassName()}) {return ${query}}`)();
            const start = performance.now();
            res.result = await fn(db, entity);
            res.executionTime = performance.now() - start;
        } catch (error) {
            res.error = String(error);
        } finally {
            res.log = loggerTransport.messageStrings;
            if (oldLogger) db.setLogger(oldLogger);
        }

        return res;
    }

    @rpc.action()
    async getCount(dbName: string, entityName: string, filter: { [name: string]: any }): Promise<number> {
        const [db, entity] = this.getDbEntity(dbName, entityName);

        return await db.query(entity).filter(filter).count();
    }

    @rpc.action()
    async getItems(
        dbName: string,
        entityName: string,
        filter: { [name: string]: any },
        sort: { [name: string]: any },
        limit: number,
        skip: number
    ): Promise<{ items: any[], executionTime: number }> {
        const [db, entity] = this.getDbEntity(dbName, entityName);
        const start = performance.now();
        const items = await db.query(entity).filter(filter).sort(sort).limit(limit).skip(skip).find();
        return { items, executionTime: performance.now() - start };
    }

    @rpc.action()
    async create(dbName: string, entityName: string): Promise<any> {
        const [db, entity] = this.getDbEntity(dbName, entityName);
        return entity.createDefaultObject();
    }

    @rpc.action()
    async commit(commit: DatabaseCommit) {
        // console.log(inspect(commit, false, 2133));

        function isNewIdWrapper(value: any): value is { $___newId: number } {
            return isObject(value) && '$___newId' in value;
        }

        for (const [dbName, c] of Object.entries(commit)) {
            const db = this.getDb(dbName);
            const session = db.createSession();

            try {
                const updates: Promise<any>[] = [];
                for (const [entityName, removes] of Object.entries(c.removed)) {
                    const entity = db.getEntity(entityName);
                    const query = session.query(entity);

                    for (const remove of removes) {
                        updates.push(query.filter(db.getReference(entity, remove)).deleteOne());
                    }
                }

                const addedItems = new Map<number, any>();

                for (const [entityName, added] of Object.entries(c.added)) {
                    const entity = db.getEntity(entityName);
                    const addedIds = c.addedIds[entityName];

                    for (let i = 0; i < added.length; i++) {
                        addedItems.set(addedIds[i], cast(added[i], undefined, undefined, undefined, entity.type));
                    }
                }

                for (const [entityName, ids] of Object.entries(c.addedIds)) {
                    const entity = db.getEntity(entityName);
                    const added = c.added[entityName];
                    for (let i = 0; i < added.length; i++) {
                        const id = ids[i];
                        const add = added[i];

                        const item = addedItems.get(id);

                        for (const reference of entity.getReferences()) {
                            if (reference.isBackReference()) continue;

                            //note, we need to operate on `added` from commit
                            // since `item` from addedItems got already converted and $___newId is lost.
                            const v = add[reference.name];
                            if (reference.isArray()) {

                            } else {
                                if (isNewIdWrapper(v)) {
                                    //reference to not-yet existing record,
                                    //so place the actual item in it, so the UoW accordingly saves
                                    item[reference.name] = addedItems.get(v.$___newId);
                                } else {
                                    //regular reference to already existing record,
                                    //so convert to reference
                                    item[reference.name] = db.getReference(reference.getResolvedReflectionClass(), item[reference.name]);
                                }
                            }
                        }
                        session.add(item);
                    }
                }

                await session.commit();

                for (const [entityName, changes] of Object.entries(c.changed)) {
                    const entity = db.getEntity(entityName);
                    const query = session.query(entity);

                    for (const change of changes) {
                        //todo: convert $set from json to class
                        const $set = change.changes.$set;
                        if (!$set) continue;
                        for (const reference of entity.getReferences()) {
                            if (reference.isBackReference()) continue;

                            const v = $set[reference.name];
                            if (v === undefined) continue;
                            if (isNewIdWrapper(v)) {
                                $set[reference.name] = addedItems.get(v.$___newId);
                            } else {
                                $set[reference.name] = db.getReference(reference.getResolvedReflectionClass(), $set[reference.name]);
                            }
                        }
                        updates.push(query.filter(db.getReference(entity, change.pk)).patchOne(change.changes));
                    }
                }

                await Promise.all(updates);
            } catch (error) {
                //todo: rollback
                throw error;
            }
        }
    }
}
