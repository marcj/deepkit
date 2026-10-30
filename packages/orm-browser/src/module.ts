import { createModuleClass, findPackagePath } from '@deepkit/app';
import { OrmBrowserController } from '@deepkit/framework';
import { Database, DatabaseRegistry } from '@deepkit/orm';
import { Config } from './config.js';
import { rpc } from '@deepkit/rpc';
import { getCurrentFileName } from '@deepkit/core';
import { dirname } from 'path';
import { registerStaticHttpController } from '@deepkit/http';

export class OrmBrowserModule extends createModuleClass({
    config: Config
}) {
    databases: Database[] = [];

    forDatabases(databases: Database[]): this {
        this.databases = databases;
        return this;
    }

    process() {
        const controllerName = '.deepkit/orm-browser/' + this.config.path;


        @rpc.controller(controllerName)
        // @ts-ignore
        class ScopedOrmBrowserController extends OrmBrowserController {
        }

        this.addController(ScopedOrmBrowserController);

        this.addProvider({
            provide: ScopedOrmBrowserController,
            useFactory: (registry: DatabaseRegistry) => {
                // without forDatabases() all databases of the app are shown
                return new ScopedOrmBrowserController(this.databases.length ? this.databases : registry.getDatabases());
            }
        });

        const localPath = findPackagePath('@deepkit/orm-browser-gui', 'dist/orm-browser-gui', getCurrentFileName());
        if (!localPath) throw new Error('@deepkit/orm-browser-gui is not installed or has no build, resolved from ' + dirname(getCurrentFileName()));

        registerStaticHttpController(this, {
            path: this.config.path,
            localPath,
            groups: ['app-static'],
            controllerName: 'ScopedController',
            indexReplace: {
                APP_CONTROLLER_NAME: controllerName
            }
        });
    }
}
