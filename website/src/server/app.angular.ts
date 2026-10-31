import { AngularModule, RequestHandler } from '@deepkit/angular-ssr';
import { app } from './app';

app.appModule.addImport(new AngularModule({
    moduleUrl: import.meta.url,
    // SSR loads its data from this server, so it has to be the port the server listens on
    serverBaseUrl: 'http://localhost:' + (process.env.APP_FRAMEWORK_PORT || process.env.app_framework_port || 8080),
}));

app.setup((module, config) => {
    if (config.baseUrl) {
        module.getImportedModuleByClass(AngularModule).configure({ publicBaseUrl: config.baseUrl });
    }
});

const isBuild = process.env.BUILD === 'angular'; //detecting prerender

export const reqHandler =
    isBuild
        ? () => undefined
        : app.get(RequestHandler).create();
