export class AppConfig {
    environment: 'prod' | 'dev' = 'dev';

    databaseHost: string = 'localhost';
    databasePort: number = 5432;
    databaseName: string = 'deepkit-website2';
    databaseUser: string = 'postgres';
    databasePassword: string = '';

    benchmarkSecret: string = 'notSet';

    baseUrl: string = '';
}
