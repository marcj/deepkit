import { App } from '@deepkit/app';
import { FrameworkModule, onServerMainBootstrap, serveFilesystem } from '@deepkit/framework';
import { AppConfig } from './config';
import { MainController } from '@app/server/controller/main.controller';
import { Search } from '@app/server/search';
import { PageProcessor } from '@app/server/page-processor';
import { MainDatabase } from '@app/server/database';
import { Database } from '@deepkit/orm';
import { MarkdownParser } from '@app/common/markdown';
import { migrate } from '@app/server/commands/migrate';
import { getPermanentRedirect, SeoController } from '@app/server/controller/seo.controller';
import { LlmsController } from '@app/server/controller/llms.controller';
import { AdminController } from '@app/server/controller/admin.controller';
import { RpcKernelSecurity, SessionState } from '@deepkit/rpc';
import { AppRpcKernelSecurity, AppSession } from '@app/server/rpc';
import { UserAuthentication } from '@app/server/user-authentication';
import { MinLength } from '@deepkit/type';
import { AdminFilesController } from '@app/server/controller/admin-files.controller';
import { Filesystem } from '@deepkit/filesystem';
import { FilesystemDatabaseAdapter } from '@deepkit/filesystem-database';
import { httpWorkflow, Redirect } from '@deepkit/http';

(global as any).window = undefined;
(global as any).document = undefined;

function createFilesystem(database: Database) {
    return new Filesystem(new FilesystemDatabaseAdapter({ database }), {
        baseUrl: '/media',
    });
}

export const app = new App({
    config: AppConfig,
    controllers: [
        AdminController,
        AdminFilesController,
        MainController,
        SeoController,
        LlmsController,
    ],
    providers: [
        PageProcessor,
        Search,
        MarkdownParser,
        UserAuthentication,
        { provide: Database, useClass: MainDatabase },
        { provide: Filesystem, useFactory: createFilesystem },
        { provide: RpcKernelSecurity, scope: 'rpc', useClass: AppRpcKernelSecurity },
        {
            provide: AppSession, scope: 'rpc', useFactory: (sessionState: SessionState) => {
                const session = sessionState.getSession();
                if (session instanceof AppSession) return session;
                throw new Error('Not authenticated');
            },
        },
    ],
    imports: [
        new FrameworkModule({
            migrateOnStartup: true, //yolo
            httpRpcBasePath: 'api/v1',
        }),
    ],
});

app.setup((module, config) => {
    serveFilesystem<Filesystem>(module, { baseUrl: 'media/' });
});

// before the router (order 100), so moved URLs don't end up in the Angular catch-all route.
// Permanent, so search engines move their index and the ranking of the old URL to the new one.
app.listen(httpWorkflow.onRoute, (event) => {
    const to = getPermanentRedirect(event.request.url || '');
    if (!to) return;
    event.send(Redirect.toUrl(to, 301));
    event.stopImmediatePropagation();
}, 50);

app.command('search:index', async (search: Search) => await search.index());
app.command('search:find', async (query: string, search: Search) => {
    console.log(await search.find(query));
});
app.command('migrate', migrate);
app.command('user:create-admin', async (email: string, password: string & MinLength<12>, auth: UserAuthentication) => {
    await auth.createAdmin(email, password);
});

app.listen(onServerMainBootstrap, (event, parser: MarkdownParser) => parser.load());

app.loadConfigFromEnv({ namingStrategy: 'upper', prefix: 'APP_', envFilePath: ['local.env'] });

// app.configureProvider<Logger>(logger => {
//     logger.setLevel('debug');
// });

if ('undefined' !== typeof module && require.main === module) {
    void app.run();
}
