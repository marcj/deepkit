import { docs, libraries, texts } from '@app/common/docs';
import { AppConfig } from '@app/server/config';
import { readTranslationsFile, translationsDir } from '@app/server/translations';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { OpenAI } from 'openai';
import path from 'path';

import { Logger } from '@deepkit/logger';

const languages: Record<string, string> = {
    zh: '中文 (Chinese)',
    ko: '한국어 (Korean)',
    ja: '日本語 (Japanese)',
    de: 'Deutsch (German)',
    pl: 'Polski (Polish)',
};

const instruction = `
Words like Error, Class, Function, Variable, Type, Interface, Method, Property, Parameter, Argument, Return Value, refer to TypeScript technical terms.
Keep error message strings in code in English, do not translate them.
You can translate code comments if needed, but do not translate any code itself.
Make sure to keep technical terms in English if possible. If it would sound weird or uncommon in the target language even in technical documentations, keep it in English.
`;

function systemPrompt(lang: string, task: string): string {
    return `
You are a helpful assistant that translates technical documentation and code comments into ${lang} ${languages[lang]}.
Please ensure the translation is accurate and maintains the original meaning.
You get from the user either just markdown or TypeScript code. Keep the structure and formatting of the original text
as much as possible, and do not add any additional explanations or comments.
Do not translate any code, only the comments and markdown.
If you encounter any text that is not in English, do not translate it.

${task}
`.trim();
}

export class Translator {
    constructor(
        protected openAi: OpenAI,
        public model: AppConfig['openaiTranslationModel'],
    ) {}

    async translateLabels(lang: string, labels: string[]): Promise<Record<string, string>> {
        if (!labels.length) return {};
        const response = await this.openAi.responses.create({
            model: this.model,
            instructions: systemPrompt(
                lang,
                `
Return a map of translations for the provided labels.
Example input: ["Hello World", "This is a test"]
Example output: {
    "Hello World": "你好，世界",
    "This is a test": "这是一个测试"
}
Make sure to use the language: ${lang} ${languages[lang]} and return the translations in a JSON format only (no markdown).
`.trim(),
            ),
            input: `Translate the following text into ${lang} ${languages[lang]}: ${JSON.stringify(labels)}`,
        });

        let text = response.output_text.trim();
        if (!text) return {};
        if (text.startsWith('```')) text = text.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '');
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error(`Failed to parse translation response: ${text}`);
        }
    }

    async translateMarkdown(lang: string, source: string): Promise<string> {
        const response = await this.openAi.responses.create({
            model: this.model,
            instructions: systemPrompt(
                lang,
                `
Return markdown in the same format as the input, but translated to ${lang} ${languages[lang]}.
Do not return any additional text or explanations.
${instruction}

Make sure to also translate link titles, headings, and any other text that is not code.
`.trim(),
            ),
            input: `Translate the following text into ${lang} ${languages[lang]}: ${source}`,
        });
        return response.output_text;
    }
}

function writeTranslationsFile(lang: string, name: string, translations: Record<string, string>) {
    const filePath = path.join(translationsDir, lang, `${name}.json`);
    writeFileSync(filePath, JSON.stringify(translations, null, 2) + '\n', 'utf8');
}

// navigation, startpage, etc. All in one big mapping file that is loaded at once.
async function translateBasics(translator: Translator, lang: string) {
    const labels: string[] = Object.values(texts);

    for (const category of docs) {
        if (category.category) labels.push(category.category);
        if (category.category === 'API') continue;
        for (const page of category.pages) {
            labels.push(page.title);
        }
    }

    for (const category of libraries) {
        if (category.category) labels.push(category.category);
        for (const item of category.items) {
            labels.push(item.title);
            labels.push(item.description);
        }
    }

    const translations = readTranslationsFile(lang, 'basics');
    const missing = labels.filter(label => !translations[label]);
    if (!missing.length) return;
    Object.assign(translations, await translator.translateLabels(lang, missing));
    writeTranslationsFile(lang, 'basics', translations);
}

type Hash = string;
type Path = string;
type TranslationState = Record<Path, Hash>;

function readState(lang: string): TranslationState {
    try {
        return JSON.parse(readFileSync(path.join(translationsDir, lang, 'state.json'), 'utf8')) || {};
    } catch (error) {
        return {};
    }
}

function writeState(lang: string, state: TranslationState) {
    writeFileSync(path.join(translationsDir, lang, 'state.json'), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function translateDocumentationPage(
    translator: Translator,
    logger: Logger,
    state: TranslationState,
    lang: string,
    page: string,
) {
    const content = readFileSync(path.join(translationsDir, '../pages/documentation', page), 'utf8');
    // pages that did not change since the last translation are skipped
    const hash = createHash('sha256').update(content).digest('hex');
    if (state[page] === hash) return;

    logger.log(`Translating ${page} to ${lang} ...`);
    const translatedContent = await translator.translateMarkdown(lang, content);
    const outputPath = path.join(translationsDir, lang, 'documentation', page);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, translatedContent, 'utf8');
    state[page] = hash;
    writeState(lang, state);
}

/**
 * Translates the navigation, start page and documentation into the given language with OpenAI.
 * Only new or changed pages are translated.
 */
export async function translateCommand(lang: string, logger: Logger, translator: Translator) {
    if (!languages[lang]) {
        throw new Error(`Unsupported language: ${lang}. Supported: ${Object.keys(languages).join(', ')}`);
    }

    logger.log(`Translating to ${lang} with ${translator.model} ...`);
    mkdirSync(path.join(translationsDir, lang), { recursive: true });

    await translateBasics(translator, lang);
    const state = readState(lang);

    for (const category of docs) {
        for (const page of category.pages) {
            const pagePath = (page.path || 'index') + '.md';
            if (pagePath.startsWith('desktop-ui/')) continue;
            await translateDocumentationPage(translator, logger, state, lang, pagePath);
        }
    }
    logger.log(`Done translating to ${lang}.`);
}
