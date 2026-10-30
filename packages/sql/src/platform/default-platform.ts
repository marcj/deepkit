/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import {
    Column,
    ColumnDiff,
    DatabaseDiff,
    DatabaseModel,
    ForeignKey,
    IndexModel,
    Table,
    TableDiff,
} from '../schema/table.js';
import { ClassType, isArray, isObject } from '@deepkit/core';
import { sqlSerializer } from '../serializer/sql-serializer.js';
import { parseType, SchemaParser } from '../reverse/schema-parser.js';
import { SQLFilterBuilder } from '../sql-filter-builder.js';
import { sqlEscape } from '../sql-escape.js';
import { Sql } from '../sql-builder.js';
import { binaryTypes, databaseAnnotation, isCustomTypeClass, isDateType, isIntegerType, ReflectionClass, ReflectionKind, ReflectionProperty, Serializer, Type } from '@deepkit/type';
import { DatabaseEntityRegistry, MigrateOptions } from '@deepkit/orm';
import { splitDotPath } from '../sql-adapter.js';
import { PreparedAdapter } from '../prepare.js';

export function isSet(v: any): boolean {
    return v !== '' && v !== undefined && v !== null;
}

export function isNonUndefined(type: Type): boolean {
    // null|undefined don't change the column type, but only whether they are nullable or not.
    return type.kind !== ReflectionKind.undefined && type.kind !== ReflectionKind.null;
}

export function typeResolvesToString(type: Type): boolean {
    if (type.kind === ReflectionKind.string) return true;
    if (type.kind === ReflectionKind.literal && 'string' === typeof type.literal) return true;
    if (type.kind === ReflectionKind.union) return type.types.filter(isNonUndefined).every(v => typeResolvesToString(v));
    if (type.kind === ReflectionKind.enum) return typeResolvesToString(type.indexType);
    return false;
}

export function typeResolvesToNumber(type: Type): boolean {
    if (type.kind === ReflectionKind.number) return true;
    if (type.kind === ReflectionKind.literal && 'number' === typeof type.literal) return true;
    if (type.kind === ReflectionKind.union) return type.types.filter(isNonUndefined).every(typeResolvesToNumber);
    if (type.kind === ReflectionKind.enum) return typeResolvesToNumber(type.indexType);
    return false;
}

export function typeResolvesToBigInt(type: Type): boolean {
    if (type.kind === ReflectionKind.bigint) return true;
    if (type.kind === ReflectionKind.literal && 'bigint' === typeof type.literal) return true;
    if (type.kind === ReflectionKind.union) return type.types.filter(isNonUndefined).every(typeResolvesToBigInt);
    if (type.kind === ReflectionKind.enum) return typeResolvesToBigInt(type.indexType);
    return false;
}

export function typeResolvesToInteger(type: Type): boolean {
    if (isIntegerType(type)) return true;
    if (type.kind === ReflectionKind.literal && 'number' === typeof type.literal && Number.isInteger(type.literal)) {
        return true;
    }
    if (type.kind === ReflectionKind.union) return type.types.filter(isNonUndefined).every(typeResolvesToInteger);
    if (type.kind === ReflectionKind.enum) return typeResolvesToInteger(type.indexType);
    return false;
}

export function typeRequiresJSONCast(type: Type): boolean {
    if (type.kind === ReflectionKind.any) return true;
    if (type.kind === ReflectionKind.objectLiteral || isCustomTypeClass(type)) return true;
    if (type.kind === ReflectionKind.array) return true;
    if (typeResolvesToBoolean(type) || typeResolvesToNumber(type) || typeResolvesToString(type)) return false;
    return true;
}

export function typeResolvesToBoolean(type: Type): boolean {
    if (type.kind === ReflectionKind.boolean) return true;
    if (type.kind === ReflectionKind.literal && 'boolean' === typeof type.literal) return true;
    if (type.kind === ReflectionKind.union) return type.types.filter(isNonUndefined).every(typeResolvesToBoolean);
    if (type.kind === ReflectionKind.enum) return typeResolvesToBoolean(type.indexType);
    return false;
}

export function typeResolvesToDate(type: Type): boolean {
    if (type.kind === ReflectionKind.union) return type.types.filter(isNonUndefined).every(isDateType);
    return isDateType(type);
}

export function noopSqlTypeCaster(placeholder: string): string {
    return placeholder;
}

export interface NamingStrategy {
    getColumnName(property: ReflectionProperty, databaseAdapterAnnotationId: string): string;

    getTableName(reflectionClass: ReflectionClass<any>): string;
}

export class DefaultNamingStrategy implements NamingStrategy {
    getColumnName(property: ReflectionProperty, databaseAdapterAnnotationId: string): string {
        const dbOptions = databaseAnnotation.getDatabase(property.type, databaseAdapterAnnotationId) || {};

        return dbOptions?.name || property.getNameAsString();
    }

    getTableName(reflectionClass: ReflectionClass<any>): string {
        return reflectionClass.getCollectionName();
    }
}

export class SqlPlaceholderStrategy {
    constructor(public offset: number = 0) {
    }

    getPlaceholder(): string {
        return '?';
    }
}

interface NativeTypeInformation {
    needsIndexPrefix: boolean;
    defaultIndexSize: number;
}

export type TypeMappingChecker = (type: Type) => boolean;

export interface TypeMapping {
    sqlType: string;
    size?: number;
    scale?: number;
    unsigned?: boolean;
}

export abstract class DefaultPlatform {
    protected defaultSqlType = 'text';
    protected defaultNowExpression: string = ''; //e.g. NOW()

    /**
     * The ID used in annotation to get database related type information (like `type`, `default`, `defaultExpr`, ...) via databaseAnnotation.getDatabase.
     */
    public annotationId = '*';

    protected typeMapping = new Map<ReflectionKind | TypeMappingChecker, TypeMapping>();
    protected nativeTypeInformation = new Map<string, Partial<NativeTypeInformation>>();

    public abstract schemaParserType: ClassType<SchemaParser>;

    public serializer: Serializer = sqlSerializer;
    public namingStrategy: NamingStrategy = new DefaultNamingStrategy();
    public placeholderStrategy: ClassType<SqlPlaceholderStrategy> = SqlPlaceholderStrategy;

    applyLimitAndOffset(sql: Sql, limit?: number, offset?: number): void {
        if (limit !== undefined) sql.append('LIMIT ' + this.quoteValue(limit));
        if (offset) sql.append('OFFSET ' + this.quoteValue(offset));
    }

    createSqlFilterBuilder(adapter: PreparedAdapter, reflectionClass: ReflectionClass<any>, tableName: string): SQLFilterBuilder {
        return new SQLFilterBuilder(adapter, reflectionClass, tableName, this.serializer, new this.placeholderStrategy);
    }

    getMigrationTableName() {
        return `deepkit_orm_migration`;
    }

    quoteValue(value: any): string {
        if (!(value instanceof Date) && (isObject(value) || isArray(value))) return sqlEscape(JSON.stringify(value));
        return sqlEscape(value);
    }

    getAggregateSelect(tableName: string, property: ReflectionProperty, func: string) {
        return `${func}(${tableName}.${this.quoteIdentifier(this.namingStrategy.getColumnName(property, this.annotationId))})`;
    }

    addBinaryType(sqlType: string, size?: number, scale?: number) {
        this.addType((type: Type) => {
            return type.kind === ReflectionKind.class && binaryTypes.includes(type.classType);
        }, sqlType, size, scale);
    }

    /**
     * Last matching check wins.
     */
    addType(kind: ReflectionKind | TypeMappingChecker, sqlType: string, size?: number, scale?: number, unsigned?: boolean) {
        this.typeMapping.set(kind, { sqlType, size, scale, unsigned });
    }

    getColumnListDDL(columns: Column[]) {
        return columns.map(v => this.getIdentifier(v)).join(', ');
    }

    getSchemaDelimiter(): string {
        return '.';
    }

    /**
     * If the platform supports the `SELECT FOR UPDATE` or `SELECT FOR SHARE`.
     */
    supportsSelectFor(): boolean {
        return false;
    }

    /**
     * If the platform supports the `PRIMARY KEY` section in `CREATE TABLE(column, column, PRIMARY KEY())`;
     */
    supportsInlinePrimaryKey(): boolean {
        return true;
    }

    /**
     * If the platform supports the `CONSTRAINT %s FOREIGN KEY` section in `CREATE TABLE(column, column, CONSTRAINT %s FOREIGN KEY)`;
     */
    supportsInlineForeignKey(): boolean {
        return true;
    }

    getPrimaryKeyDDL(table: Table) {
        if (!table.hasPrimaryKey()) return '';

        return `PRIMARY KEY (${this.getColumnListDDL(table.getPrimaryKeys())})`;
    }

    normalizeTables(tables: Table[]) {

    }

    getEntityFields(schema: ReflectionClass<any>): ReflectionProperty[] {
        const fields: ReflectionProperty[] = [];
        for (const property of schema.getProperties()) {
            if (property.isBackReference()) continue;
            fields.push(property);
        }
        return fields;
    }

    protected getTypeMapping(type: Type): TypeMapping | undefined {
        let mapping = undefined as TypeMapping | undefined;
        const annotation = databaseAnnotation.getDatabase(type, this.annotationId);
        if (annotation && annotation.type) {
            return { sqlType: annotation.type };
        }

        for (const [checker, m] of this.typeMapping.entries()) {
            if ('number' === typeof checker) {
                if (checker === type.kind) mapping = m;
            } else {
                if (checker(type)) mapping = m;
            }
        }
        return mapping;
    }

    protected setColumnType(column: Column, typeProperty: ReflectionProperty) {
        column.type = this.defaultSqlType;
        const options = typeProperty.getDatabase(this.annotationId);
        if (options && options.type) {
            parseType(column, options.type);
        } else {
            const map = this.getTypeMapping(typeProperty.type);
            if (map) {
                column.type = map.sqlType;
                column.size = map.size;
                column.scale = map.scale;
                column.unsigned = map.unsigned === true;
            }
        }

        if (!column.defaultExpression && this.defaultNowExpression && typeProperty.type.kind === ReflectionKind.class && typeProperty.type.classType === Date) {
            const initializer = typeProperty.getDefaultValueFunction();
            if (initializer && initializer.toString().includes('new Date')) {
                //infer as NOW()
                column.defaultValue = undefined;
                column.defaultExpression = this.defaultNowExpression;
            }
        }
    }

    /**
     * Whether an accessor to e.g. "shippingAddress"->'$.street' = ?
     * requires real json at ? or SQL value is enough.
     * If this returns true, the value for ? is passed through JSON.stringify().
     */
    deepColumnAccessorRequiresJsonString(): boolean {
        return true;
    }

    getDeepColumnAccessor(table: string, column: string, path: string) {
        if (!path.startsWith('[')) path = '.' + path;
        return `${table ? table + '.' : ''}${this.quoteIdentifier(column)}->${this.quoteValue('$' + path)}`;
    }

    getColumnAccessor(table: string, path: string) {
        if (path.includes('.')) {
            const [first, second] = splitDotPath(path);
            return this.getDeepColumnAccessor(table, first, second);
        }

        return `${table ? table + '.' : ''}${this.quoteIdentifier(path)}`;
    }

    getModifyDatabaseDDL(databaseDiff: DatabaseDiff, options: MigrateOptions): string[] {
        const lines: string[] = [];

        if (options.isDropSchema()) {
            for (const table of databaseDiff.removedTables) lines.push(this.getDropTableDDL(table));
        }

        for (const [from, to] of databaseDiff.renamedTables) lines.push(this.getRenameTableDDL(from, to));

        for (const table of databaseDiff.addedTables) {
            lines.push(...this.getAddTableDDL(table));
            if (options.isIndex()) {
                lines.push(...this.getAddIndicesDDL(table));
            }
        }

        for (const tableDiff of databaseDiff.modifiedTables) lines.push(...this.getModifyTableDDL(tableDiff, options));

        if (!this.supportsInlineForeignKey() && options.isForeignKey()) {
            for (const table of databaseDiff.addedTables) lines.push(...this.getAddForeignKeysDDL(table));
        }

        if (lines.length) {
            lines.unshift(this.getBeginDDL());
            lines.push(this.getEndDDL());
        }

        return lines.filter(isSet);
    }

    createTables(entityRegistry: DatabaseEntityRegistry, database: DatabaseModel = new DatabaseModel()): Table[] {
        const mergedToSingleTable = new Set<ReflectionClass<any>>();

        const refs = new Map<ReflectionClass<any>, ReflectionClass<any>>();

        for (let schema of entityRegistry.forMigration()) {
            //a parent of a single-table inheritance might already be added
            if (mergedToSingleTable.has(schema)) continue;

            if (!schema.getProperties().length) {
                throw new Error(`Entity ${schema.getClassName()} has no properties. Is reflection enabled?`);
            }

            //if the schema is decorated with singleTableInheritance, all properties of all siblings will be copied, as all
            //will be in one big table.
            if (schema.singleTableInheritance) {
                const superClass = schema.getSuperReflectionClass();
                if (!superClass) throw new Error(`Class ${schema.getClassName()} has singleTableInheritance enabled but has no super class.`);

                if (mergedToSingleTable.has(superClass)) continue;
                mergedToSingleTable.add(superClass);

                const discriminant = superClass.getSingleTableInheritanceDiscriminantName();

                schema = superClass.clone();
                refs.set(superClass, schema);

                //add all properties from all sub classes.
                for (const subSchema of schema.subClasses) {
                    for (let property of subSchema.getProperties()) {
                        if (schema.hasProperty(property.getName())) continue;
                        property = property.clone();
                        //make all newly added properties optional
                        property.setOptional(true);
                        schema.registerProperty(property);
                    }
                }
            }

            const table = new Table(this.namingStrategy.getTableName(schema));

            database.schemaMap.set(schema, table);

            table.schemaName = schema.databaseSchemaName || database.schemaName;

            for (const property of this.getEntityFields(schema)) {
                if (property.isBackReference()) continue;
                if (property.isDatabaseMigrationSkipped(database.adapterName)) continue;

                const column = table.addColumn(this.namingStrategy.getColumnName(property, this.annotationId), property);
                const dbOptions = databaseAnnotation.getDatabase(property.type, this.annotationId) || {};

                if (!property.isAutoIncrement()) {
                    if (dbOptions.default !== undefined) {
                        column.defaultValue = dbOptions.default;
                    } else if (dbOptions.defaultExpr) {
                        column.defaultExpression = dbOptions.defaultExpr;
                    } else if (!dbOptions.noDefault && !property.hasDefaultFunctionExpression()) {
                        column.defaultValue = property.getDefaultValue();
                    }
                }

                const isNullable = property.isNullable() || property.isOptional();
                column.isNotNull = !isNullable;
                column.isPrimaryKey = property.isPrimaryKey();
                if (property.isAutoIncrement()) {
                    column.isAutoIncrement = true;
                    column.isNotNull = true;
                }

                const typeProperty = property.isReference() ? property.getResolvedReflectionClass().getPrimary() : property;
                this.setColumnType(column, typeProperty);
            }
        }

        //set foreign keys
        for (let [schema, table] of database.schemaMap.entries()) {
            for (const property of schema.getProperties()) {
                const reference = property.getReference();
                if (!reference) continue;

                const foreignSchema = entityRegistry.get(property.type);
                const foreignTable = database.schemaMap.get(refs.get(foreignSchema) || foreignSchema);
                if (!foreignTable) {
                    throw new Error(`Referenced entity ${foreignSchema.getClassName()} from ${schema.getClassName()}.${property.getNameAsString()} is not available`);
                }
                const foreignKey = table.addForeignKey('', foreignTable);
                foreignKey.localColumns = [table.getColumn(this.namingStrategy.getColumnName(property, this.annotationId))];
                foreignKey.foreignColumns = foreignTable.getPrimaryKeys();
                if (reference.onDelete) foreignKey.onDelete = reference.onDelete;
                if (reference.onUpdate) foreignKey.onUpdate = reference.onUpdate;
            }
        }

        //create index
        for (let [schema, table] of database.schemaMap.entries()) {
            for (const index of schema.indexes) {
                if (index.options.name && table.hasIndexByName(index.options.name)) continue;

                const columns = index.names.map(v => table.getColumn(v));
                if (table.hasIndex(columns, index.options.unique)) continue;

                const addedIndex = table.addIndex(index.options.name || '', index.options.unique);
                addedIndex.columns = columns;
                addedIndex.spatial = index.options.spatial || false;
            }

            //sqlite and postgres do not create a index for foreign keys. But this
            //is rather important for back referencing joins.
            for (const foreignKeys of table.foreignKeys) {
                if (table.hasIndex(foreignKeys.localColumns)) continue;

                //there's no need to add an index to a foreign key that is a primary key
                const allPrimaryKey = foreignKeys.localColumns.every(v => v.isPrimaryKey);
                if (allPrimaryKey) continue;

                const index = table.addIndex(foreignKeys.getName(), false);
                index.columns = foreignKeys.localColumns;
            }

            //manual composite indices
            for (const property of schema.getProperties()) {
                const indexOptions = property.getIndex();
                if (!indexOptions) continue;

                const column = table.getColumnForProperty(property);
                if (table.hasIndex([column], indexOptions.unique)) continue;

                const addedIndex = table.addIndex('', indexOptions.unique);
                addedIndex.columns = [column];
            }
        }

        const tables = [...database.schemaMap.values()];
        this.normalizeTables(tables);
        database.tables = tables;
        return tables;
    }

    quoteIdentifier(id: string): string {
        return `"${id.replace('.', '"."')}"`;
    }

    isJson(type: Type): boolean {
        return this.getTypeMapping(type)?.sqlType.includes('json') || false;
    }

    getSqlTypeCaster(type: Type): (placeholder: string) => string {
        return noopSqlTypeCaster;
    }

    getTableIdentifier(schema: ReflectionClass<any>): string {
        const collectionName = this.namingStrategy.getTableName(schema);

        if (schema.databaseSchemaName) return this.quoteIdentifier(schema.databaseSchemaName + this.getSchemaDelimiter() + collectionName);
        return this.quoteIdentifier(collectionName);
    }

    getIdentifier(object: Table | Column | IndexModel | ForeignKey, append: string = ''): string {
        if (object instanceof Table) return this.getFullIdentifier(object, append);
        return this.quoteIdentifier(object.getName() + append);
    }

    getFullIdentifier(object: Table | Column, append: string = ''): string {
        return this.quoteIdentifier(object.getFullName(this.getSchemaDelimiter()) + append);
    }

    getPrimaryKeyName(table: Table): string {
        return this.getFullIdentifier(table, '_pk');
    }

    getDropPrimaryKeyDDL(table: Table) {
        if (!table.hasPrimaryKey()) return '';

        return `ALTER TABLE ${this.getIdentifier(table)} DROP CONSTRAINT ${this.getPrimaryKeyName(table)}`;
    }

    getAddPrimaryKeyDDL(table: Table) {
        return `ALTER TABLE ${this.getIdentifier(table)} ADD ${this.getPrimaryKeyDDL(table)}`;
    }

    getBeginDDL(): string {
        return '';
    }

    getEndDDL(): string {
        return '';
    }

    getAddTablesDDL(database: DatabaseModel): string[] {
        const ddl: string[] = [];

        ddl.push(this.getBeginDDL());

        for (const table of database.tables) {
            ddl.push(this.getDropTableDDL(table));
            ddl.push(...this.getAddTableDDL(table));
            ddl.push(...this.getAddIndicesDDL(table));
        }

        for (const table of database.tables) {
            if (!this.supportsInlineForeignKey()) ddl.push(...this.getAddForeignKeysDDL(table));
        }

        ddl.push(this.getEndDDL());

        return ddl.filter(isSet);
    }

    getAddSchemasDDL(database: DatabaseModel): string {
        const schemaNames = new Set<string>();

        if (database.schemaName) schemaNames.add(database.schemaName);
        for (const table of database.tables) {
            if (table.schemaName) schemaNames.add(table.schemaName);
        }

        return [...schemaNames.values()].map(v => this.getAddSchemaDDL(v)).join(';\n');
    }

    getAddSchemaDDL(schemaName: string): string {
        if (!schemaName) return '';
        return `CREATE SCHEMA ${this.quoteIdentifier(schemaName)}`;
    }

    getUseSchemaDDL(table: Table) {
        return ``;
    }

    getResetSchemaDDL(table: Table): string {
        return ``;
    }

    getRenameTableDDL(from: Table, to: Table): string {
        return `ALTER TABLE ${this.getIdentifier(from)} RENAME TO ${this.getIdentifier(to)}`;
    }

    supportsAggregatedAlterTable(): boolean {
        return true;
    }

    getModifyTableDDL(diff: TableDiff, options: MigrateOptions): string[] {
        const ddl: string[] = [];

        // drop indices, foreign keys
        if (options.isForeignKey()) {
            for (const foreignKey of diff.removedFKs.values()) ddl.push(this.getDropForeignKeyDDL(foreignKey));
            for (const [from] of diff.modifiedFKs.values()) ddl.push(this.getDropForeignKeyDDL(from));
        }

        if (options.isDropIndex()) {
            for (const index of diff.removedIndices.values()) ddl.push(this.getDropIndexDDL(index));
        }

        if (options.isIndex()) {
            for (const [from] of diff.modifiedIndices.values()) ddl.push(this.getDropIndexDDL(from));
        }

        //merge field changes into one command. This is more compatible especially with PK constraints.
        const alterTableLines: string[] = [];

        const prefix = `ALTER TABLE ${this.getIdentifier(diff.to)}`;

        const add = (value: string) => {
            if (this.supportsAggregatedAlterTable() && value.trim().startsWith(prefix)) {
                alterTableLines.push(value.trim().substr(prefix.length));
            } else {
                ddl.push(value);
            }
        };

        // alter entity structure
        if (diff.hasModifiedPk()) add(this.getDropPrimaryKeyDDL(diff.from));
        for (const [from, to] of diff.renamedColumns.values()) add(this.getRenameColumnDDL(from, to));
        if (diff.modifiedColumns.length) for (const columnDiff of diff.modifiedColumns) add(this.getModifyColumnDDL(columnDiff));
        if (diff.addedColumns.length) for (const column of diff.addedColumns) add(this.getAddColumnDDL(column));
        for (const column of diff.removedColumns.values()) add(this.getRemoveColumnDDL(column));

        if (diff.hasModifiedPk()) add(this.getAddPrimaryKeyDDL(diff.to));

        if (alterTableLines.length) {
            ddl.push(`${prefix} ${alterTableLines.map(v => v.trim()).join(', ')}`);
        }

        // create indices, foreign keys
        if (options.isIndex()) {
            for (const [, to] of diff.modifiedIndices.values()) ddl.push(this.getAddIndexDDL(to));
            for (const index of diff.addedIndices.values()) ddl.push(this.getAddIndexDDL(index));
        }

        if (options.isForeignKey()) {
            for (const [, to] of diff.modifiedFKs.values()) ddl.push(this.getAddForeignKeyDDL(to));
            for (const foreignKey of diff.addedFKs.values()) ddl.push(this.getAddForeignKeyDDL(foreignKey));
        }

        return ddl.filter(isSet);
    }

    getAddTableDDL(table: Table, withForeignKey: boolean = true): string[] {
        const lines: string[] = [];

        lines.push(this.getUseSchemaDDL(table));

        lines.push(this.getCreateTableDDL(table, withForeignKey));

        lines.push(this.getResetSchemaDDL(table));

        return lines.filter(isSet);
    }

    getCreateTableDDL(table: Table, withForeignKey: boolean = true): string {
        const lines: string[] = [];
        for (const column of table.columns) lines.push(this.getColumnDDL(column));
        if (this.supportsInlinePrimaryKey() && table.hasPrimaryKey()) lines.push(this.getPrimaryKeyDDL(table));
        if (withForeignKey) {
            if (this.supportsInlineForeignKey()) for (const foreignKey of table.foreignKeys) lines.push(this.getForeignKeyDDL(foreignKey));
        }

        return `CREATE TABLE ${this.getIdentifier(table)} (\n    ${lines.join(',\n    ')}\n)`;
    }

    getAddForeignKeysDDL(table: Table): string[] {
        return table.foreignKeys.map(v => this.getAddForeignKeyDDL(v)).filter(isSet);
    }

    getAddIndicesDDL(table: Table): string[] {
        return table.indices.map(v => this.getAddIndexDDL(v));
    }

    getAddForeignKeyDDL(foreignKey: ForeignKey): string {
        return `ALTER TABLE ${this.getIdentifier(foreignKey.table)} ADD ${this.getForeignKeyDDL(foreignKey)}`;
    }

    getForeignKeyDDL(foreignKey: ForeignKey): string {
        const ddl: string[] = [];

        ddl.push(`
        CONSTRAINT ${this.getIdentifier(foreignKey)}
        FOREIGN KEY (${this.getColumnListDDL(foreignKey.localColumns)})
        REFERENCES ${this.getIdentifier(foreignKey.foreign)} (${this.getColumnListDDL(foreignKey.foreignColumns)})
        `.trim());

        if (foreignKey.onUpdate) ddl.push(`ON UPDATE ${foreignKey.onUpdate}`);
        if (foreignKey.onDelete) ddl.push(`ON DELETE ${foreignKey.onDelete}`);

        return ddl.join(' ');
    }

    getAddIndexDDL(index: IndexModel): string {
        const u = index.isUnique ? ' UNIQUE' : '';

        const columns: string[] = [];
        for (const column of index.columns) {
            if (index.size) {
                columns.push(`${this.getIdentifier(column)}(${index.size})`);
                continue;
            }

            const typeInfo = this.nativeTypeInformation.get(column.type || '');
            if (typeInfo && typeInfo.needsIndexPrefix) {
                columns.push(`${this.getIdentifier(column)}(${typeInfo.defaultIndexSize || 100})`);
                continue;
            }

            columns.push(`${this.getIdentifier(column)}`);
        }

        return `CREATE${u} INDEX ${this.getIdentifier(index)} ON ${this.getIdentifier(index.table)} (${columns.join(', ')})`;
    }

    getDropTableDDL(table: Table): string {
        return `DROP TABLE IF EXISTS ${this.getIdentifier(table)}`;
    }

    // getAddColumnDDL(column: Column): string {
    //     return `ALTER TABLE ${this.getIdentifier(column.table)} ADD ${this.getColumnDDL(column)}`;
    // }

    getRemoveColumnDDL(column: Column): string {
        return `ALTER TABLE ${this.getIdentifier(column.table)} DROP COLUMN ${this.getIdentifier(column)}`;
    }

    getRenameColumnDDL(from: Column, to: Column): string {
        return `ALTER TABLE ${this.getIdentifier(from.table)} RENAME COLUMN ${this.getIdentifier(from)} TO ${this.getIdentifier(to)}`;
    }

    // getModifyColumnDDL(column: Column): string {
    //     return `ALTER TABLE ${this.getIdentifier(column.table)} MODIFY ${this.getColumnDDL(column)}`;
    // }

    getModifyColumnDDL(diff: ColumnDiff): string {
        return `ALTER TABLE ${this.getIdentifier(diff.to.table)} MODIFY ${this.getColumnDDL(diff.to)}`;
    }

    getAddColumnDDL(column: Column) {
        return `ALTER TABLE ${this.getIdentifier(column.table)} ADD ${this.getColumnDDL(column)}`;
    }

    getDropForeignKeyDDL(foreignKey: ForeignKey): string {
        return `ALTER TABLE ${this.getIdentifier(foreignKey.table)} DROP CONSTRAINT ${this.getIdentifier(foreignKey)}`;
    }

    getDropIndexDDL(index: IndexModel): string {
        return `DROP INDEX ${this.getIdentifier(index)}`;
    }

    getUniqueDDL(unique: IndexModel): string {
        return `UNIQUE INDEX ${this.getIdentifier(unique)} (${this.getColumnListDDL(unique.columns)})`;
    }

    getColumnDDL(column: Column) {
        const ddl: string[] = [];

        ddl.push(this.getIdentifier(column));
        ddl.push((column.type || 'INTEGER') + column.getSizeDefinition());
        ddl.push(this.getColumnDefaultValueDDL(column));
        ddl.push(column.isNotNull ? this.getNotNullString() : this.getNullString());
        if (column.isAutoIncrement) ddl.push(this.getAutoIncrement());

        return ddl.filter(isSet).join(' ');
    }

    getColumnDefaultValueDDL(column: Column) {
        if (column.defaultExpression !== undefined || column.defaultValue !== undefined) {
            return 'DEFAULT ' + this.getDefaultExpression(column);
        }
        return '';
    }

    getDefaultExpression(column: Column): string {
        if (column.defaultExpression !== undefined) {
            return column.defaultExpression;
        }
        if (column.defaultValue !== undefined) {
            return this.quoteValue(column.defaultValue);
        }
        return '';
    }

    getAutoIncrement() {
        return 'IDENTITY';
    }

    getNotNullString() {
        return 'NOT NULL';
    }

    getNullString() {
        return 'NULL';
    }
}

