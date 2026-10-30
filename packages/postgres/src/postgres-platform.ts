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
    DefaultPlatform,
    IndexModel,
    isSet,
    PreparedAdapter,
    sqlDateToString,
    SqlPlaceholderStrategy,
    Table,
    typeResolvesToBigInt,
    typeResolvesToBoolean,
    typeResolvesToDate,
    typeResolvesToInteger,
    typeResolvesToNumber,
    typeResolvesToString,
} from '@deepkit/sql';
import { postgresSerializer } from './postgres-serializer.js';
import {
    isReferenceType,
    isUUIDType,
    ReflectionClass,
    ReflectionKind,
    ReflectionProperty,
    Serializer,
    Type,
    TypeNumberBrand,
} from '@deepkit/type';
import { PostgresSchemaParser } from './postgres-schema-parser.js';
import { PostgreSQLFilterBuilder } from './sql-filter-builder.js';
import { isArray, isObject } from '@deepkit/core';

function escapeLiteral(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (value instanceof Date) return sqlDateToString(value);
    if ('number' === typeof value || 'bigint' === typeof value) return String(value);
    if ('string' !== typeof value) return escapeLiteral(String(value));

    let hasBackslash = false;
    let escaped = '\'';

    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (c === '\'') {
            escaped += c + c;
        } else if (c === '\\') {
            escaped += c + c;
            hasBackslash = true;
        } else {
            escaped += c;
        }
    }

    escaped += '\'';

    if (hasBackslash) {
        escaped = ' E' + escaped;
    }

    return escaped;
}

export class PostgresPlaceholderStrategy extends SqlPlaceholderStrategy {
    override getPlaceholder() {
        return '$' + (++this.offset);
    }
}

export class PostgresPlatform extends DefaultPlatform {
    protected override defaultSqlType = 'text';
    public override annotationId = 'postgres';

    protected override defaultNowExpression = `now()`;
    public override readonly serializer: Serializer = postgresSerializer;
    override schemaParserType = PostgresSchemaParser;

    override placeholderStrategy = PostgresPlaceholderStrategy;

    constructor() {
        super();
        this.addType(() => true, 'jsonb'); //default everything is jsonb

        this.addType(typeResolvesToNumber, 'double precision');
        this.addType(typeResolvesToInteger, 'integer');
        this.addType(typeResolvesToBigInt, 'bigint');
        this.addType(typeResolvesToBoolean, 'boolean');
        this.addType(typeResolvesToString, 'text');

        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.integer, 'integer');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.int8, 'smallint');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.uint8, 'smallint');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.int16, 'smallint');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.uint16, 'smallint');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.int32, 'integer');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.uint32, 'integer');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.float32, 'real');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.float64, 'double precision');
        this.addType(type => type.kind === ReflectionKind.number && type.brand === TypeNumberBrand.float, 'double precision');

        this.addType(isUUIDType, 'uuid');
        this.addBinaryType('bytea');
        this.addType(typeResolvesToDate, 'timestamp');
    }

    override getSqlTypeCaster(type: Type): (placeholder: string) => string {
        if (isReferenceType(type)) {
            type = ReflectionClass.from(type).getPrimary().type;
        }

        const dbType = this.getTypeMapping(type);
        if (!dbType) return super.getSqlTypeCaster(type);

        return (placeholder: string) => placeholder + '::' + dbType.sqlType;
    }

    override getAggregateSelect(tableName: string, property: ReflectionProperty, func: string) {
        if (func === 'group_concat') {
            return `array_to_string(array_agg(${tableName}.${this.quoteIdentifier(property.name)}), ',')`;
        }
        return super.getAggregateSelect(tableName, property, func);
    }

    override createSqlFilterBuilder(adapter: PreparedAdapter, schema: ReflectionClass<any>, tableName: string): PostgreSQLFilterBuilder {
        return new PostgreSQLFilterBuilder(adapter, schema, tableName, this.serializer, new this.placeholderStrategy);
    }

    override getDeepColumnAccessor(table: string, column: string, path: string) {
        return `${table ? table + '.' : ''}${this.quoteIdentifier(column)}->${this.quoteValue(path)}`;
    }

    override quoteValue(value: any): string {
        if (!(value instanceof Date) && (isObject(value) || isArray(value))) return escapeLiteral(JSON.stringify(value));
        if (value instanceof Date) return 'TIMESTAMP ' + sqlDateToString(value);
        return escapeLiteral(value);
    }

    protected getColumnType(column: Column): string {
        const ddl: string[] = [];
        if (column.isAutoIncrement) {
            ddl.push(`SERIAL`);
        } else {
            const foreignKey = column.table.getForeignKeyOfLocalColumn(column);
            if (foreignKey) {
                const [foreignPk] = foreignKey.foreignColumns;
                if (foreignPk.isAutoIncrement) {
                    //the foreignPK has `SERIAL` type, which is basically an INTEGER.
                    ddl.push('INTEGER');
                } else {
                    ddl.push((foreignPk.type || 'INTEGER') + column.getSizeDefinition());
                }
            } else {
                ddl.push((column.type || 'INTEGER') + column.getSizeDefinition());
            }
        }
        return ddl.filter(isSet).join(' ');
    }

    override getColumnDDL(column: Column) {
        const ddl: string[] = [];

        ddl.push(this.getIdentifier(column));
        ddl.push(this.getColumnType(column));

        if (!column.isAutoIncrement) {
            ddl.push(column.isNotNull ? this.getNotNullString() : this.getNullString());
            ddl.push(this.getColumnDefaultValueDDL(column));
        }

        return ddl.filter(isSet).join(' ');
    }

    getModifyColumnDDL(diff: ColumnDiff): string {
        // postgres doesn't support multiple column modifications in one ALTER TABLE statement
        // see https://www.postgresql.org/docs/current/sql-altertable.html

        const lines: string[] = [];

        const identifier = this.getIdentifier(diff.to);

        if (diff.from.type !== diff.to.type || diff.from.isAutoIncrement !== diff.to.isAutoIncrement) {
            lines.push(`ALTER TABLE ${this.getIdentifier(diff.to.table)} ALTER ${identifier} TYPE ${this.getColumnType(diff.to)}`);
        }

        if (diff.from.isNotNull !== diff.to.isNotNull) {
            if (diff.to.defaultExpression !== undefined || diff.to.defaultValue !== undefined) {
                lines.push(`ALTER TABLE ${this.getIdentifier(diff.to.table)} ALTER ${identifier} SET ${this.getColumnDefaultValueDDL(diff.to)}`);
            } else {
                lines.push(`ALTER TABLE ${this.getIdentifier(diff.to.table)} ALTER ${identifier} DROP DEFAULT`);
            }
        }

        if (diff.from.isNotNull !== diff.to.isNotNull) {
            if (diff.to.isNotNull) {
                //NOT NULL is newly added, so we need to update all existing rows to have a value
                const defaultExpression = this.getDefaultExpression(diff.to);
                if (defaultExpression) {
                    lines.push(`UPDATE ${this.getIdentifier(diff.to.table)} SET ${identifier} = ${defaultExpression} WHERE ${identifier} IS NULL`);
                }
                lines.push(`ALTER TABLE ${this.getIdentifier(diff.to.table)} ALTER ${identifier} SET NOT NULL`);
            } else {
                lines.push(`ALTER TABLE ${this.getIdentifier(diff.to.table)} ALTER ${identifier} DROP NOT NULL`);
            }
        }

        return lines.join(';\n')
    }

    getDefaultExpression(column: Column): string {
        if (undefined !== column.defaultValue) {
            // if type is from JSON type, we need to cast whatever is in defaultValue to JSON
            if (column.type === 'jsonb') return `${this.quoteValue(JSON.stringify(column.defaultValue))}::jsonb`;
            if (column.type === 'json') return `${this.quoteValue(JSON.stringify(column.defaultValue))}::json`;
        }
        return super.getDefaultExpression(column);
    }

    getUniqueDDL(unique: IndexModel): string {
        return `CONSTRAINT ${this.getIdentifier(unique)} UNIQUE (${this.getColumnListDDL(unique.columns)})`;
    }

    getDropIndexDDL(index: IndexModel): string {
        if (index.isUnique) {
            return `ALTER TABLE ${this.getIdentifier(index.table)} DROP CONSTRAINT ${this.getIdentifier(index)}`;
        }
        return super.getDropIndexDDL(index);
    }

    supportsInlineForeignKey(): boolean {
        return false;
    }

    supportsAggregatedAlterTable(): boolean {
        return false;
    }

    supportsSelectFor(): boolean {
        return true;
    }

    getAutoIncrement() {
        return '';
    }

    getDropTableDDL(table: Table): string {
        return `DROP TABLE IF EXISTS ${this.getIdentifier(table)} CASCADE`;
    }

    getUseSchemaDDL(table: Table) {
        if (!table.schemaName) return '';
        return `SET search_path TO ${this.quoteIdentifier(table.schemaName)}`;
    }

    getResetSchemaDDL(table: Table): string {
        if (!table.schemaName) return '';
        return `SET search_path TO public`;
    }
}
