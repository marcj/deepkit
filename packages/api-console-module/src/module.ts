import { createModuleClass, findPackagePath } from '@deepkit/app';
import { HttpRouteFilter, normalizeDirectory, registerStaticHttpController } from '@deepkit/http';
import { ApiConsoleApi } from '@deepkit/api-console-api';
import { Config } from './module.config.js';
import { rpc } from '@deepkit/rpc';
import { ApiConsoleController } from './controller.js';
import { dirname } from 'path';
import { getCurrentFileName } from '@deepkit/core';

export class ApiConsoleModule extends createModuleClass({
    name: 'apiConsole',
    config: Config,
}) {
    protected routeFilter = new HttpRouteFilter().excludeRoutes({group: 'app-static'});

    filter(cb: (filter: HttpRouteFilter) => any): this {
        cb(this.routeFilter);
        return this;
    }

    process() {
        this.addProvider({provide: HttpRouteFilter, useValue: this.routeFilter});

        if (!this.config.listen) {
            @rpc.controller(ApiConsoleApi)
            class NamedApiConsoleController extends ApiConsoleController {
            }

            this.addController(NamedApiConsoleController);
            return;
        }

        const controllerName = '.deepkit/api-console' + normalizeDirectory(this.config.path);

        @rpc.controller(controllerName)
        class NamedApiConsoleController extends ApiConsoleController {
        }

        this.addController(NamedApiConsoleController);

        const localPath = findPackagePath('@deepkit/api-console-gui', 'dist/api-console-gui', getCurrentFileName());
        if (!localPath) throw new Error('@deepkit/api-console-gui is not installed or has no build, resolved from ' + dirname(getCurrentFileName()));

        registerStaticHttpController(this, {
            path: this.config.path,
            localPath,
            groups: ['app-static'],
            controllerName: 'ApiConsoleController',
            indexReplace: {
                APP_CONTROLLER_NAME: controllerName
            }
        });
    }
}
