/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { findQuerySatisfied as ormFindQuerySatisfied } from '@deepkit/orm';
import { FilterQuery } from '@deepkit/rpc';

//todo: move to live-database
export function findQuerySatisfied<T extends { [index: string]: any }>(target: T, query: FilterQuery<T>): boolean {
    return ormFindQuerySatisfied(target, query as any);
}

export function normalizeDirectory(path: string): string {
    if (path[0] !== '/') path = '/' + path;
    if (path[path.length - 1] !== '/') path = path + '/';
    return path;
}
