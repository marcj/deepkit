/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { SQLFilterBuilder } from '@deepkit/sql';

export class SQLiteFilterBuilder extends SQLFilterBuilder {
    override bindValue(value: any): any {
        if (typeof value === 'boolean') return value ? 1 : 0;
        return super.bindValue(value);
    }

    regexpComparator(lvalue: string, value: RegExp): string {
        let regex =  value.flags + '::' + value.source; //will be decoded in sqlite-adapter
        return `${lvalue} REGEXP ${this.bindParam(regex)}`;
    }
}
