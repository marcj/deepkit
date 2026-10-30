/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { declarationTransformer, transformer } from './src/compiler.js';
import type { Program } from 'typescript';

export * from './src/compiler.js';
export * from './src/loader.js';
export * from './src/filter.js';

export default function myTransformerPlugin(program: Program, opts: {}) {
    return {
        before: transformer,
        afterDeclarations: declarationTransformer,
    };
}
