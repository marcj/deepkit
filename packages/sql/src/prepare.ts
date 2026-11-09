import { LruCache } from './lru-cache.js';
import { ReflectionClass, resolvePath, resolveProperty, Type, TypeClass, TypeObjectLiteral } from '@deepkit/type';
import { DefaultPlatform } from './platform/default-platform.js';

export type SqlTypeCast = (placeholder: string) => string;

export interface PreparedField {
    type: Type;
    name: string; // actual name from property
    columnName: string; // after naming strategy
    optional: boolean;

    json: boolean;
    autoIncrement: boolean;

    columnNameEscaped: string; // .e.g `{column}`
    columnEscapedWithTable: string; // .e.g `user`.`{column}`
    sqlTypeCast: SqlTypeCast;
}

/** The SQL of a query, and how to convert the values of its filter to the parameters. */
export interface CachedSelect {
    sql: string;
    binders: ((value: any) => any)[];
}

export interface PreparedEntity {
    /** the SQL of queries that differ only in the values of their filter */
    selectCache?: LruCache<CachedSelect>;
    platform: DefaultPlatform,
    type: TypeClass | TypeObjectLiteral;
    name: string;
    tableName: string;
    tableNameEscaped: string; // .e.g `{table}`

    primaryKey: PreparedField;
    fieldMap: { [name: string]: PreparedField };
    fields: PreparedField[];
    sqlTypeCaster: { [path: string]: SqlTypeCast };
}

export interface PreparedAdapter {
    getName(): string;
    platform: DefaultPlatform;
    preparedEntities: Map<ReflectionClass<any>, PreparedEntity>;
}

export function getPreparedEntity(adapter: PreparedAdapter, entity: ReflectionClass<any>): PreparedEntity {
    let prepared = adapter.preparedEntities.get(entity);
    if (prepared) return prepared;

    const type = entity.type;
    const name = entity.getName();
    const tableName = adapter.platform.namingStrategy.getTableName(entity);
    const tableNameEscaped = adapter.platform.getTableIdentifier(entity);
    const fieldMap: { [name: string]: PreparedField } = {};
    const fields: PreparedField[] = [];
    let primaryKey: PreparedField | undefined = undefined;
    const sqlTypeCaster: { [path: string]: SqlTypeCast } = {};

    for (const property of entity.getProperties()) {
        if (property.isBackReference()) continue;
        if (property.isDatabaseSkipped(adapter.getName())) continue;

        const columnName = adapter.platform.namingStrategy.getColumnName(property, adapter.platform.annotationId);
        const columnNameEscaped = adapter.platform.quoteIdentifier(columnName);
        const columnEscapedWithTable = `${tableNameEscaped}.${columnNameEscaped}`;
        const type = property.type;
        const optional = property.isOptional();
        const autoIncrement = property.isAutoIncrement();

        const field: PreparedField = {
            type,
            name: property.name,
            columnName,
            autoIncrement,
            optional,
            json: adapter.platform.isJson(type),
            columnNameEscaped,
            columnEscapedWithTable,
            sqlTypeCast: adapter.platform.getSqlTypeCaster(type),
        };
        fieldMap[property.name] = field;
        fields.push(field);
        if (property.isPrimaryKey()) primaryKey = field;
    }

    if (!primaryKey) throw new Error(`No primary key defined for ${name}.`);

    prepared = { platform: adapter.platform, type, primaryKey, name, tableName, tableNameEscaped, fieldMap, fields, sqlTypeCaster };
    adapter.preparedEntities.set(entity, prepared);
    return prepared;
}

export function getDeepTypeCaster(entity: PreparedEntity, path: string) {
    if (entity.sqlTypeCaster[path]) return entity.sqlTypeCaster[path];

    const forType = resolveProperty(resolvePath(path, entity.type));
    return entity.sqlTypeCaster[path] = entity.platform.getSqlTypeCaster(forType);
}
