// Dev-only CLI for the translations, see README. It is not imported by app.ts,
// so the translation code and openai stay out of the Angular SSR build.
import { Translator, translateCommand } from '@app/server/commands/translate';

import { app } from './app';

app.appModule.addProvider(Translator);
app.command('translate', translateCommand);

void app.run();
