/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { isNumeric } from '@deepkit/core';
import { Column, DatabaseModel, ForeignKey, parseDefaultLiteral, parseType, SchemaParser, Table } from '@deepkit/sql';

export class PostgresSchemaParser extends SchemaParser {
    protected defaultPrecisions = {
        'char': 1,
        'character': 1,
        'integer': 32,
        'real': 24,
        'bigint': 64,
        'smallint': 16,
        'double precision': 53
    };

    protected numberTypes: string[] = [
        'smallint',
        'integer',
        'bigint',
        'real',
        'double precision',
        'decimal',
        'numeric',
        'smallserial',
        'serial',
        'bigserial',
    ];


    async parse(database: DatabaseModel, limitTableNames?: string[]) {
        await this.parseTables(database, limitTableNames);

        for (const table of database.tables) {
            await this.addColumns(table);
        }

        for (const table of database.tables) {
            await this.addIndexes(table);
            await this.addForeignKeys(database, table);
        }
    }

    protected async addIndexes(table: Table) {
        const oid = `'"${table.schemaName || 'public'}"."${table.getName()}"'::regclass`;

        const indexes = await this.connection.execAndReturnAll(`
        SELECT DISTINCT ON (cls.relname) cls.relname as idxname, indkey, idx.indisunique as unique, idx.indisprimary as primary
        FROM pg_index idx
                 JOIN pg_class cls ON cls.oid = indexrelid
        WHERE indrelid = ${oid}
          AND NOT indisprimary
        ORDER BY cls.relname
        `);

        for (const row of indexes) {
            if (row.primary) {
                table.getColumn(row.column_name).isPrimaryKey = true;
                continue;
            }

            if (!row.idxname) continue;
            const index = table.addIndex(row.idxname, row.unique);

            const attnums = row.indkey.split(' ');
            for (const attnum of attnums) {
                const column = await this.connection.execAndReturnSingle(`
                    SELECT a.attname
                    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
                    WHERE c.oid = ${oid} AND a.attnum = ${attnum} AND NOT a.attisdropped
                    ORDER BY a.attnum
                `);
                if (!column || !column.attname) continue;
                index.addColumn(column.attname);
            }
        }
    }

    protected async addForeignKeys(database: DatabaseModel, table: Table) {
        const rows = await this.connection.execAndReturnAll(`
        select kcu.table_name      as table_name,
               kcu.constraint_name as constraint_name,
               rel_kcu.table_name  as referenced_table_name,
               rel_kcu.constraint_schema  as referenced_schema_name,
               kcu.column_name     as column_name,
               rel_kcu.column_name as referenced_column_name,
               kcu.constraint_name,
               rco.update_rule,
               rco.delete_rule
        from information_schema.table_constraints tco
                 join information_schema.key_column_usage kcu
                      on tco.constraint_schema = kcu.constraint_schema
                          and tco.constraint_name = kcu.constraint_name
                 join information_schema.referential_constraints rco
                      on tco.constraint_schema = rco.constraint_schema
                          and tco.constraint_name = rco.constraint_name
                 join information_schema.key_column_usage rel_kcu
                      on rco.unique_constraint_schema = rel_kcu.constraint_schema
                          and rco.unique_constraint_name = rel_kcu.constraint_name
                          and kcu.ordinal_position = rel_kcu.ordinal_position
        where tco.table_name = '${table.getName()}'
          and tco.table_schema = '${table.schemaName || 'public'}'
          and tco.constraint_schema = tco.table_schema
          and tco.constraint_type = 'FOREIGN KEY'
        order by kcu.table_schema, kcu.table_name, kcu.ordinal_position
        `);

        let lastId: string | undefined;
        let foreignKey: ForeignKey | undefined;
        for (const row of rows) {
            if (row.constraint_name !== lastId) {
                lastId = row.constraint_name;
                const foreignTable = database.getTable(row.referenced_table_name);
                foreignKey = table.addForeignKey(row.constraint_name, foreignTable);
            }

            if (foreignKey) {
                foreignKey.addReference(row.column_name, row.referenced_column_name);
                foreignKey.onUpdate = row.update_rule;
                foreignKey.onDelete = row.delete_rule;
            }
        }
    }

    protected async addColumns(table: Table) {
        const rows = await this.connection.execAndReturnAll(`
        SELECT
            column_name, data_type, column_default, is_nullable,
            numeric_precision, numeric_scale, character_maximum_length
        FROM information_schema.columns
        WHERE
            table_schema = '${table.schemaName || 'public'}' AND table_name = '${table.getName()}'
        `);

        for (const row of rows) {
            const column = table.addColumn(row.column_name);
            parseType(column, row.data_type);
            const size = row.character_maximum_length || row.numeric_precision;
            const scale = row.numeric_scale;
            if (size && column.type && size !== this.defaultPrecisions[column.type]) {
                column.size = size;
            }

            if (scale) column.scale = scale;

            column.isNotNull = row.is_nullable === 'NO';

            this.mapDefault(row.column_default, column);

            if (row.data_type.includes('SERIAL')) {
                column.isAutoIncrement = true;
            }
        }
    }

    protected mapDefault(dbDefault: any, column: Column) {
        if (dbDefault === null || dbDefault === undefined) return;

        if ('string' === typeof dbDefault && dbDefault.includes('nextval(') && dbDefault.includes('::regclass')) {
            column.isAutoIncrement = true;
            return;
        }

        const colonPos = dbDefault.indexOf('::');
        if (colonPos !== -1) dbDefault = dbDefault.slice(0, colonPos);

        if (column.type) {
            if (isNumeric(dbDefault) && this.numberTypes.includes(column.type)) {
                column.defaultValue = parseFloat(dbDefault);
                return;
            }

            const literal = parseDefaultLiteral(dbDefault);
            if (literal) column.defaultValue = literal.value;
        }

        if (dbDefault.includes('(')) {
            column.defaultExpression = dbDefault;
            return;
        }
    }


    protected async parseTables(database: DatabaseModel, limitTableNames?: string[]) {
        const rows = await this.connection.execAndReturnAll(`
            select table_name, table_schema as schema_name
            from information_schema.tables where table_schema not like 'pg_%' and table_schema = current_schema()
            and table_name != 'geometry_columns' and table_name != 'spatial_ref_sys' and table_type != 'VIEW'
            and table_schema = '${database.schemaName || 'public'}'
            order by table_name
        `);

        for (const row of rows) {
            if (limitTableNames && !limitTableNames.includes(row.table_name)) continue;

            const table = database.addTable(row.table_name);
            if (row.schema_name !== 'public') {
                table.schemaName = row.schema_name || database.schemaName;
            } else {
                table.schemaName = database.schemaName;
            }
        }
    }
}
