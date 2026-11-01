export class AppConfig {
    environment: 'prod' | 'dev' = 'dev';

    databaseHost: string = 'localhost';
    databasePort: number = 5432;
    databaseName: string = 'deepkit-website2';
    databaseUser: string = 'postgres';
    databasePassword: string = '';

    baseUrl: string = '';

    /**
     * For `npm run translate <lang>`. `claude` runs the Claude Code CLI with its login (e.g. a Claude subscription),
     * `openai` uses the OpenAI API with openaiApiKey.
     */
    translationProvider: 'claude' | 'openai' = 'claude';
    /** Claude model for translations, empty uses the Claude Code default. */
    claudeTranslationModel: string = '';

    /** See https://platform.openai.com/api-keys */
    openaiApiKey: string = '';
    openaiTranslationModel: string = 'gpt-6.1-sol';
}
