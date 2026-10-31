// Dev-only CLI for the translations, see README. It is not imported by app.ts,
// so the translation code and openai stay out of the Angular SSR build.
import { Translator, translateCommand } from '@app/server/commands/translate';
import { AppConfig } from '@app/server/config';
import { OpenAI } from 'openai';

import { app } from './app';

app.appModule.addProvider(
    {
        provide: OpenAI,
        useFactory(openaiApiKey: AppConfig['openaiApiKey']) {
            if (!openaiApiKey) throw new Error('No OpenAI API key configured, set APP_OPENAI_API_KEY');
            return new OpenAI({ apiKey: openaiApiKey });
        },
    },
    Translator,
);
app.command('translate', translateCommand);

void app.run();
