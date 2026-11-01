// Dev-only CLI for the translations, see README. It is not imported by app.ts,
// so the translation code and openai stay out of the Angular SSR build.
import {
    ClaudeCodeModel,
    OpenAiModel,
    TranslationModel,
    Translator,
    translateCheckCommand,
    translateCommand,
} from '@app/server/commands/translate';
import { AppConfig } from '@app/server/config';
import { OpenAI } from 'openai';

import { app } from './app';

app.appModule.addProvider(
    {
        provide: TranslationModel,
        useFactory(config: AppConfig): TranslationModel {
            if (config.translationProvider === 'openai') {
                if (!config.openaiApiKey) throw new Error('No OpenAI API key configured, set APP_OPENAI_API_KEY');
                return new OpenAiModel(new OpenAI({ apiKey: config.openaiApiKey }), config.openaiTranslationModel);
            }
            return new ClaudeCodeModel(config.claudeTranslationModel);
        },
    },
    Translator,
);
app.command('translate', translateCommand);
app.command('translate:check', translateCheckCommand);

void app.run();
