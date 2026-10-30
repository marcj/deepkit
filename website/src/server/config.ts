export class AppConfig {
    environment: 'prod' | 'dev' = 'dev';

    databaseHost: string = 'localhost';
    databasePort: number = 5432;
    databaseName: string = 'deepkit-website2';
    databaseUser: string = 'postgres';
    databasePassword: string = '';

    benchmarkSecret: string = 'notSet';

    baseUrl: string = '';

    /** For `npm run translate <lang>`, see https://platform.openai.com/api-keys */
    openaiApiKey: string = '';
    openaiTranslationModel: string = 'gpt-6.1-sol';
}
