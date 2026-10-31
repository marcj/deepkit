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

// `node dist/app/server/server.mjs migrate` runs a command of the app instead of the server.
// The request handler starts the server, so it is only created for server:start.
const command = process.argv[1]?.endsWith('server.mjs') ? process.argv[2] : undefined;
const isCommand = !!command && command !== 'server:start';
if (isCommand) {
    app.execute(process.argv.slice(2)).then(exitCode => process.exit(exitCode), () => process.exit(1));
}

export const reqHandler =
    isBuild || isCommand
        ? () => undefined
        : app.get(RequestHandler).create();
