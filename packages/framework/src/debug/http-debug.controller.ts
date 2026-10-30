/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { registerStaticHttpController } from '@deepkit/http';
import { AppModule, findPackagePath } from '@deepkit/app';
import { dirname } from 'path';
import { getCurrentFileName } from '@deepkit/core';

export function registerDebugHttpController(module: AppModule<any>, path: string): void {
    const currentDir = dirname(getCurrentFileName());
    const localPath = findPackagePath('@deepkit/framework-debug-gui', 'dist/framework-debug-gui', getCurrentFileName());
    if (localPath) {
        registerStaticHttpController(module, { path, localPath, groups: ['app-static'], controllerName: 'FrameworkDebuggerController' });
    } else {
        console.log('Warning: @deepkit/framework-debug-gui is not installed or has no build, resolved from ' + currentDir);
    }
}
