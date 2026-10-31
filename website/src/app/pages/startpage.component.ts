import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '@app/app/components/footer.component.js';
import { HeaderComponent } from '@app/app/components/header.component.js';
import { HighlightCodeComponent } from '@app/app/components/highlight-code.component.js';
import { AppDescription, AppTitle } from '@app/app/components/title.js';
import { i18nRoutePipe, TranslatePipe, Translation } from '@app/app/components/translation.js';
import { BenchmarkChartComponent, latestChartEntries } from '@app/app/pages/benchmarks.component.js';
import { LibrariesComponent } from '@app/app/pages/libraries/libraries.component.js';
import { texts } from '@app/common/docs.js';

const oneTypeCode = `import { App } from '@deepkit/app';
import { FrameworkModule } from '@deepkit/framework';
import { HttpBody, HttpQuery, HttpRouterRegistry } from '@deepkit/http';
import { Database } from '@deepkit/orm';
import { SQLiteDatabaseAdapter } from '@deepkit/sqlite';
import { AutoIncrement, Email, Maximum, MinLength, PrimaryKey, Unique } from '@deepkit/type';

// validation, serialization, database table and API docs in one type
class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date();
    username: string & MinLength<3> & Unique = '';
    email: Email = '';
}

class AppDatabase extends Database {
    constructor() {
        super(new SQLiteDatabaseAdapter('app.sqlite'), [User]);
    }
}

const app = new App({
    providers: [AppDatabase],
    imports: [new FrameworkModule({ migrateOnStartup: true })],
});
const router = app.get(HttpRouterRegistry);

// POST /users {"username": "peter", "email": "peter@example.com"}
router.post('/users', async (user: HttpBody<User>, database: AppDatabase) => {
    await database.persist(user);
    return user;
});

// GET /users?limit=10
router.get('/users', (database: AppDatabase, limit: HttpQuery<number> & Maximum<100> = 10) => {
    return database.query(User).limit(limit).find();
});

app.run();`;

const oneTypeResponse = `$ curl -X POST localhost:8080/users -d '{"username": "pe", "email": "nope"}'
HTTP/1.1 400 Bad Request
{
  "message": "Validation error",
  "errors": [
    { "path": "username", "code": "minLength", "message": "Min length is 3" },
    { "path": "email", "code": "pattern", "message": "Pattern ^\\S+@\\S+$ does not match" }
  ]
}`;

const runtimeTypesCode = `interface Order {
    id: number & Positive;
    items: { sku: string & MinLength<3>; quantity: number }[];
    shipped?: Date;
}

if (is<Order>(data)) {
    data.items; // type guard, data is an Order here
}

validate<Order>(data);
// [{ path: 'items.0.sku', code: 'minLength', ... }]

cast<Order>({ id: '1', items: [], shipped: '2026-10-31' });
// { id: 1, items: [], shipped: Date }

typeOf<Order>(); // all type information at runtime`;

const httpCode = `// GET /users/34
router.get('/users/:id', (id: number & Positive, db: AppDatabase) =>
    db.query(User).filter({ id }).findOne(),
);

// or as controller class
class UserController {
    constructor(private db: AppDatabase) {}

    // GET /users?limit=10
    @http.GET('/users')
    list(limit: HttpQuery<number> & Maximum<100> = 10) {
        return this.db.query(User).limit(limit).find();
    }
}`;

const diCode = `interface Mailer {
    send(to: string, text: string): Promise<void>;
}

class SmtpMailer implements Mailer {
    async send(to: string, text: string) { /* ... */ }
}

class Signup {
    // resolved by its type, an interface
    constructor(private mailer: Mailer) {}

    async register(email: string) {
        await this.mailer.send(email, 'Welcome!');
    }
}

const app = new App({
    providers: [Signup, provide<Mailer>(SmtpMailer)],
});`;

const ormCode = `class User {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date();
    constructor(
        public username: string & MinLength<3> & Unique,
        public active: boolean = true,
    ) {}
}

const database = new Database(
    new PostgresDatabaseAdapter({ database: 'app' }), [User],
);
await database.migrate();
await database.persist(new User('peter'));

const users = await database.query(User)
    .filter({ active: true, created: { $gt: lastWeek } })
    .orderBy('created', 'desc')
    .limit(10)
    .find(); // User[], real instances`;

const rpcCode = `// server
@rpc.controller('/users')
class UserController {
    constructor(private db: AppDatabase) {}

    @rpc.action()
    async find(username: string): Promise<User | undefined> {
        return await this.db.query(User)
            .filter({ username })
            .findOneOrUndefined();
    }
}

// client, in the browser or another server
const client = new RpcWebSocketClient('ws://localhost:8080');
const users = client.controller<UserController>('/users');

const user = await users.find('peter'); // User | undefined`;

const appCode = `class AppConfig {
    databaseUrl: string = 'postgres://localhost/app';
    pageSize: number & Positive = 20;
}

class UserList {
    // only the part of the configuration it needs
    constructor(private pageSize: AppConfig['pageSize']) {}
}

const app = new App({
    config: AppConfig,
    providers: [UserList],
});

// $ app user:create peter --admin
app.command('user:create', (
    username: string & MinLength<3>,
    admin: boolean & Flag = false,
) => {
    // ...
});

// APP_PAGE_SIZE=50 sets pageSize, -1 fails at startup
app.loadConfigFromEnv().run();`;

const features = [
    { title: texts.runtimeTypesTitle, text: texts.runtimeTypesText, link: 'documentation/runtime-types', code: runtimeTypesCode },
    { title: texts.httpTitle, text: texts.httpText, link: 'documentation/http', code: httpCode },
    { title: texts.diTitle, text: texts.diText, link: 'documentation/dependency-injection', code: diCode },
    { title: texts.ormTitle, text: texts.ormText, link: 'documentation/orm', code: ormCode },
    { title: texts.rpcTitle, text: texts.rpcText, link: 'documentation/rpc', code: rpcCode },
    { title: texts.appTitle, text: texts.appText, link: 'documentation/app', code: appCode },
];

const performanceCharts = [
    {
        title: 'Validation with error messages',
        entries: latestChartEntries('comparison/validation', {
            'deepkit validate (invalid)': 'Deepkit',
            'typia validate (invalid)': 'typia',
            'zod safeParse (invalid)': 'Zod',
            'valibot safeParse (invalid)': 'Valibot',
            'typebox Errors (invalid)': 'TypeBox',
            'arktype (invalid)': 'ArkType',
            'class-validator (invalid)': 'class-validator',
        }),
    },
    {
        title: 'MongoDB: find one document by id',
        entries: latestChartEntries('comparison/orm-mongo', {
            'Deepkit: findOne by id': 'Deepkit',
            'mongodb: findOne by id': 'mongodb (driver)',
            'Mongoose: findOne by id': 'Mongoose',
            'MikroORM: findOne by id': 'MikroORM',
        }),
    },
    {
        title: 'PostgreSQL: find one row by id',
        entries: latestChartEntries('comparison/orm-postgres', {
            'Deepkit: findOne by id': 'Deepkit',
            'Sequelize: findOne by id': 'Sequelize',
            'Drizzle: findOne by id': 'Drizzle',
            'TypeORM: findOne by id': 'TypeORM',
            'Prisma: findOne by id': 'Prisma',
            'MikroORM: findOne by id': 'MikroORM',
        }),
    },
    {
        title: 'PostgreSQL: insert 1,000 rows',
        entries: latestChartEntries('comparison/orm-postgres', {
            'Deepkit: insert 1,000 rows': 'Deepkit',
            'Sequelize: insert 1,000 rows': 'Sequelize',
            'TypeORM: insert 1,000 rows': 'TypeORM',
            'MikroORM: insert 1,000 rows': 'MikroORM',
            'Drizzle: insert 1,000 rows': 'Drizzle',
            'Prisma: insert 1,000 rows': 'Prisma',
        }),
    },
].filter(v => v.entries.length);

@Component({
    imports: [
        AppTitle,
        AppDescription,
        HeaderComponent,
        FooterComponent,
        HighlightCodeComponent,
        BenchmarkChartComponent,
        LibrariesComponent,
        RouterLink,
        TranslatePipe,
        i18nRoutePipe,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <app-title [value]="texts.startTitle | translate" [full]="true" />
        <app-description [value]="texts.startDescription | translate" />
        <div class="page">
            <dw-header [float]="true" />
            <div class="wrapper hero">
                <h1>{{ texts.heroTitle | translate }}</h1>
                <h3 class="text">{{ texts.heroText | translate }}</h3>
                <div class="code-box">npm init &#64;deepkit/app&#64;latest my-app</div>
                <p class="llm-hint">{{ texts.llmHint | translate }} <a href="/llms.txt">llms.txt</a> (<a href="/llms-full.txt">llms-full.txt</a>)</p>
            </div>

            <main>
                <div class="separator1"></div>

                <div class="feature-center">
                    <h2>{{ texts.oneTypeTitle | translate }}</h2>
                    <p class="feature-text">{{ texts.oneTypeText | translate }}</p>
                    <div class="code-stack">
                        <highlight-code [code]="oneTypeCode" />
                        <highlight-code lang="bash" [code]="oneTypeResponse" />
                    </div>
                    <p class="actions">
                        <a class="button big" [routerLink]="'documentation/app' | i18nRoute">{{ texts.gettingStarted | translate }}</a>
                    </p>
                </div>
            </main>

            @if (performanceCharts.length) {
                <div class="feature-center color">
                    <div class="wrapper">
                        <h2>{{ texts.performanceTitle | translate }}</h2>
                        <p class="feature-text">{{ texts.performanceText | translate }}</p>
                        <div class="charts">
                            @for (chart of performanceCharts; track chart.title) {
                                <benchmark-chart [compact]="true" [title]="chart.title | translate" [data]="chart.entries" />
                            }
                        </div>
                        <p class="actions">
                            <a class="button big" routerLink="/benchmarks">{{ texts.allBenchmarks | translate }}</a>
                        </p>
                    </div>
                </div>
            }

            <main>
                @for (feature of features; track feature.title; let odd = $odd) {
                    <div class="two-column feature-with-code" [class.left]="odd">
                        <div class="text">
                            <h2>{{ feature.title | translate }}</h2>
                            <p class="feature-text">{{ feature.text | translate }}</p>
                            <a class="button" [routerLink]="feature.link | i18nRoute">{{ texts.learnMore | translate }}</a>
                        </div>
                        <div class="code-box-feature">
                            <highlight-code [code]="feature.code" />
                        </div>
                    </div>
                }

                <div class="feature-center libraries">
                    <h2>{{ texts.librariesTitle | translate }}</h2>
                    <p class="feature-text">{{ texts.librariesText | translate }}</p>
                    <app-libraries />
                </div>

                <div class="feature-center get-started">
                    <h2>{{ texts.startNowTitle | translate }}</h2>
                    <p class="feature-text">{{ texts.startNowText | translate }}</p>
                    <div class="code-box">npm init &#64;deepkit/app&#64;latest my-app</div>
                    <p class="actions">
                        <a class="button big primary" [routerLink]="'documentation/app' | i18nRoute">{{ texts.gettingStarted | translate }}</a>
                        <a class="button big" href="https://github.com/deepkit/deepkit-framework">{{ texts.viewOnGitHub | translate }}</a>
                    </p>
                </div>
            </main>
        </div>
        <dw-footer />
    `,
    styles: `
        :host {
            display: block;
            text-align: left;
        }
        h1,
        h2,
        h3 {
            font-style: normal;
            color: #f9eddf;
        }
        h1 {
            font-size: 48px;
            font-weight: 300;
            line-height: 120%;
            max-width: 620px;
            margin: 0 auto 30px;
        }
        h2 {
            font-size: 30px;
            font-weight: 400;
            line-height: 1.25;
            margin: 0;
        }
        h3.text {
            font-size: 16px;
            font-weight: 300;
            line-height: 180%;
            color: #c5c5c5;
            max-width: 650px;
            margin: auto;
        }
        .page {
            position: relative;
            /* the banner fades into the page background */
            background-image: linear-gradient(to bottom, rgba(9, 10, 11, 0) 480px, #090a0b 650px), url(/assets/images/startpage-banner.jpg);
            background-size: 100% 650px, auto 650px;
            /* below the header, so its bright top does not shine through the header */
            background-position: center 80px;
            background-repeat: no-repeat;
        }
        .wrapper,
        main {
            margin: auto;
            max-width: 1100px;
            box-sizing: border-box;
        }
        @media (max-width: 1120px) {
            .wrapper,
            main {
                padding: 0 12px;
            }
        }
        .hero {
            text-align: center;
            padding-top: 560px;
            max-width: 750px;
        }
        .code-box {
            margin-top: 45px;
            border: 1px solid #292929;
            background: #0c0d0f;
            box-shadow: 0 15px 22px 0 rgba(0, 0, 0, 0.21);
            color: #f35828;
            display: inline-block;
            font-family: 'Source Code Pro', monospace;
            font-size: 16px;
            padding: 17px 30px;
            user-select: all;
        }
        .llm-hint {
            margin: 22px 0 0;
            font-size: 13px;
            color: #7d838b;
        }
        .llm-hint a {
            color: var(--color-link);
            font-family: 'Source Code Pro', monospace;
        }
        main {
            position: relative;
            padding-top: 30px;
        }
        .separator1 {
            background-image: url(/assets/images/separator1.svg);
            background-position: center;
            background-repeat: no-repeat;
            height: 74px;
            margin: 30px auto;
        }
        .feature-text {
            font-size: 15px;
            margin: 25px 0;
            font-weight: 400;
            line-height: 200%;
            color: #bbbbbb;
        }
        .feature-center {
            text-align: center;
            margin: 100px auto;
        }
        .feature-center .feature-text {
            text-align: center;
            max-width: 760px;
            margin-left: auto;
            margin-right: auto;
        }
        .feature-center.color {
            margin: 0;
            padding: 80px 0;
            border-top: 1px solid rgba(34, 91, 123, 0.3);
            border-bottom: 1px solid rgba(34, 91, 123, 0.3);
            background: linear-gradient(180deg, #0d1b23 0%, #0c1a21 25%, #0a151b 48.44%, #091219 75.52%, #091219 100%);
        }
        .code-stack {
            text-align: left;
            max-width: 900px;
            margin: auto;
        }
        .code-stack highlight-code,
        .code-box-feature highlight-code {
            margin: 0 0 12px;
        }
        .actions {
            margin-top: 30px;
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .charts {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 40px 80px;
            text-align: left;
            margin-top: 40px;
        }
        .two-column {
            margin: 140px auto;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 55px;
        }
        .two-column > .text {
            flex: 4 1 0;
            min-width: 0;
        }
        .two-column > .text .feature-text {
            text-align: justify;
        }
        .feature-with-code.left {
            flex-direction: row-reverse;
        }
        .code-box-feature {
            flex: 6 1 0;
            min-width: 0;
            border-radius: 3px;
        }
        .code-box-feature highlight-code {
            margin: 0;
        }
        a.button:not(.primary) {
            border-radius: 26px;
            border: 1px solid rgba(255, 102, 42, 0.48);
            background: #171b1e;
        }
        a.button:not(.primary):hover {
            background: #494f53;
        }
        a.button.primary {
            border-radius: 26px;
        }
        .libraries app-libraries {
            display: block;
            text-align: left;
            margin-top: 40px;
        }
        .get-started {
            margin-bottom: 150px;
        }
        .get-started .code-box {
            margin-top: 10px;
        }
        @media (max-width: 1200px) {
            .page {
                background-image: linear-gradient(to bottom, rgba(9, 10, 11, 0) 330px, #090a0b 450px), url(/assets/images/startpage-banner-small.jpg);
                background-size: 100% 450px, auto 450px;
            }
            .hero {
                padding-top: 390px;
            }
        }
        @media (max-width: 900px) {
            .charts {
                grid-template-columns: minmax(0, 1fr);
            }
            .two-column,
            .feature-with-code.left {
                flex-direction: column;
                align-items: stretch;
                gap: 20px;
                margin: 80px auto;
            }
        }
        @media (max-width: 640px) {
            h1 {
                font-size: 34px;
            }
            h2 {
                font-size: 24px;
            }
            .code-box {
                font-size: 14px;
                padding: 14px 18px;
            }
        }
    `,
})
export class StartpageComponent {
    protected readonly texts = texts;
    protected readonly features = features;
    protected readonly performanceCharts = performanceCharts;
    protected readonly oneTypeCode = oneTypeCode;
    protected readonly oneTypeResponse = oneTypeResponse;
    protected translation = inject(Translation);
}
