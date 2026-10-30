import { App } from '@deepkit/app';
import { FrameworkModule, onServerMainBootstrap, serveFilesystem } from '@deepkit/framework';
import { AppConfig } from './config';
import { MainController } from '@app/server/controller/main.controller';
import { Search } from '@app/server/search';
import { PageProcessor } from '@app/server/page-processor';
import { MainDatabase } from '@app/server/database';
import { Database } from '@deepkit/orm';
import { Url } from '@app/server/url';
import { MarkdownParser } from '@app/common/markdown';
import { migrate } from '@app/server/commands/migrate';
import { importExamples, importQuestions } from '@app/server/commands/import';
import { BenchmarkController, BenchmarkHttpController } from '@app/server/controller/benchmark.controller';
import { AdminController } from '@app/server/controller/admin.controller';
import { RpcKernelSecurity, SessionState } from '@deepkit/rpc';
import { AppRpcKernelSecurity, AppSession } from '@app/server/rpc';
import { UserAuthentication } from '@app/server/user-authentication';
import { AdminFilesController } from '@app/server/controller/admin-files.controller';
import { Filesystem } from '@deepkit/filesystem';
import { FilesystemDatabaseAdapter } from '@deepkit/filesystem-database';
import { httpWorkflow } from '@deepkit/http';

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
        BenchmarkController,
        BenchmarkHttpController,
    ],
    providers: [
        PageProcessor,
        Search,
        Url,
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

app.listen(httpWorkflow.onRequest, (event) => {
    const url = event.request.url || '';
    if (url.startsWith('/documentation') || url.startsWith('/blog')) {
        // move all /documentation/* to /en/documentation/*
        const to = `/en${url}`;
        event.response.setHeader('Location', to);
        event.response.status(302);
        event.response.end(`Redirecting to ${to}`);
        event.send(event.response);
    }
});

app.command('search:index', async (search: Search) => await search.index());
app.command('search:find', async (query: string, search: Search) => {
    console.log(await search.find(query));
});
app.command('import:questions', importQuestions);
app.command('import:examples', importExamples);
app.command('migrate', migrate);

app.listen(onServerMainBootstrap, (event, parser: MarkdownParser) => parser.load());

app.loadConfigFromEnv({ namingStrategy: 'upper', prefix: 'APP_', envFilePath: ['local.env'] });

// app.configureProvider<Logger>(logger => {
//     logger.setLevel('debug');
// });

if ('undefined' !== typeof module && require.main === module) {
    void app.run();
}
