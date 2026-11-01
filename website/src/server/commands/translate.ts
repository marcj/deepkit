import { docs, libraries, texts, translatesPageTitles } from '@app/common/docs';
import { translatedLanguages } from '@app/common/languages';
import { AppConfig } from '@app/server/config';
import { readTranslationsFile, translationsDir } from '@app/server/translations';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { OpenAI } from 'openai';
import { tmpdir } from 'os';
import path from 'path';

import { Flag } from '@deepkit/app';
import { Logger } from '@deepkit/logger';

const languagesMap: Record<string, string> = Object.fromEntries(translatedLanguages.map(v => [v.code, v.label]));

const instruction = `
Words like Error, Class, Function, Variable, Type, Interface, Method, Property, Parameter, Argument, Return Value, refer to TypeScript technical terms.
Keep error message strings in code in English, do not translate them.
You can translate code comments if needed, but do not translate any code itself.
Make sure to keep technical terms in English if possible. If it would sound weird or uncommon in the target language even in technical documentations, keep it in English.
`;

function systemPrompt(lang: string, task: string): string {
    return `
You are a helpful assistant that translates technical documentation and code comments into ${lang} ${languagesMap[lang]}.
Please ensure the translation is accurate and maintains the original meaning.
You get from the user either just markdown or TypeScript code. Keep the structure and formatting of the original text
as much as possible, and do not add any additional explanations or comments.
Do not translate any code, only the comments and markdown.
If you encounter any text that is not in English, do not translate it.

${task}
`.trim();
}

/**
 * The language model behind the Translator: one instruction (system prompt) plus one input, returns the text output.
 */
export abstract class TranslationModel {
    abstract readonly name: string;

    abstract complete(instructions: string, input: string): Promise<string>;
}

/**
 * Runs the Claude Code CLI (`claude -p`), so it uses whatever Claude Code is logged in with, e.g. a Claude subscription.
 */
export class ClaudeCodeModel extends TranslationModel {
    constructor(public model: string = '') {
        super();
    }

    get name() {
        return `Claude Code${this.model ? ` (${this.model})` : ''}`;
    }

    complete(instructions: string, input: string): Promise<string> {
        const args = [
            '-p',
            '--output-format',
            'text',
            '--system-prompt',
            instructions,
            // a pure text task: no tools, MCP servers, skills or saved sessions
            '--tools',
            '',
            '--strict-mcp-config',
            '--disable-slash-commands',
            '--no-session-persistence',
        ];
        if (this.model) args.push('--model', this.model);

        return new Promise((resolve, reject) => {
            // outside the repository, so no CLAUDE.md ends up in the prompt
            const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
            child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
            child.on('error', error => reject(new Error(`Could not run the claude CLI, is Claude Code installed? ${error.message}`)));
            child.on('close', code => {
                if (code === 0) return resolve(stdout);
                reject(new Error(`claude exited with code ${code}: ${(stderr || stdout).trim()}`));
            });
            // the input goes through stdin, documentation pages are too long for an argument
            child.stdin.end(input);
        });
    }
}

export class OpenAiModel extends TranslationModel {
    constructor(
        protected openAi: OpenAI,
        public model: string,
    ) {
        super();
    }

    get name() {
        return `OpenAI (${this.model})`;
    }

    async complete(instructions: string, input: string): Promise<string> {
        const response = await this.openAi.responses.create({ model: this.model, instructions, input });
        return response.output_text;
    }
}

export class Translator {
    constructor(public model: TranslationModel) {}

    async translateLabels(lang: string, labels: string[]): Promise<Record<string, string>> {
        if (!labels.length) return {};
        const output = await this.model.complete(
            systemPrompt(
                lang,
                `
Return a map of translations for the provided labels.
Example input: ["Hello World", "This is a test"]
Example output: {
    "Hello World": "你好，世界",
    "This is a test": "这是一个测试"
}
Make sure to use the language: ${lang} ${languagesMap[lang]} and return the translations in a JSON format only (no markdown).
`.trim(),
            ),
            `Translate the following text into ${lang} ${languagesMap[lang]}: ${JSON.stringify(labels)}`,
        );

        let text = output.trim();
        if (!text) return {};
        if (text.startsWith('```')) text = text.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '');
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error(`Failed to parse translation response: ${text}`);
        }
    }

    async translateMarkdown(lang: string, source: string): Promise<string> {
        return await this.model.complete(
            systemPrompt(
                lang,
                `
Return markdown in the same format as the input, but translated to ${lang} ${languagesMap[lang]}.
Do not return any additional text or explanations.
${instruction}

Make sure to also translate link titles, headings, and any other text that is not code.
`.trim(),
            ),
            `Translate the following text into ${lang} ${languagesMap[lang]}: ${source}`,
        );
    }
}

function writeTranslationsFile(lang: string, name: string, translations: Record<string, string>) {
    const filePath = path.join(translationsDir, lang, `${name}.json`);
    writeFileSync(filePath, JSON.stringify(translations, null, 2) + '\n', 'utf8');
}

/**
 * All labels of the navigation, start page, etc. They are translated into one big mapping file (basics.json) that is loaded at once.
 */
export function collectBasicsLabels(): string[] {
    const labels: string[] = Object.values(texts);

    for (const category of docs) {
        if (category.category) labels.push(category.category);
        if (!translatesPageTitles(category)) continue;
        for (const page of category.pages) {
            labels.push(page.title);
        }
    }

    for (const category of libraries) {
        if (category.category) labels.push(category.category);
        labels.push(category.description);
        for (const item of category.items) {
            labels.push(item.title);
            labels.push(item.description);
        }
    }
    return [...new Set(labels)];
}

async function translateBasics(translator: Translator, lang: string) {
    const translations = readTranslationsFile(lang, 'basics');
    const missing = collectBasicsLabels().filter(label => !translations[label]);
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

/**
 * Documentation pages (relative to src/pages/documentation) that are translated.
 */
export function translatablePages(): string[] {
    const pages: string[] = [];
    for (const category of docs) {
        for (const page of category.pages) {
            const pagePath = (page.path || 'index') + '.md';
            if (pagePath.startsWith('desktop-ui/')) continue;
            pages.push(pagePath);
        }
    }
    return pages;
}

function pageHash(page: string): Hash {
    const content = readFileSync(path.join(translationsDir, '../pages/documentation', page), 'utf8');
    return createHash('sha256').update(content).digest('hex');
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
    const hash = pageHash(page);
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
    if (!languagesMap[lang]) {
        throw new Error(`Unsupported language: ${lang}. Supported: ${Object.keys(languagesMap).join(', ')}`);
    }

    logger.log(`Translating to ${lang} with ${translator.model.name} ...`);
    mkdirSync(path.join(translationsDir, lang), { recursive: true });

    await translateBasics(translator, lang);
    const state = readState(lang);

    for (const page of translatablePages()) {
        await translateDocumentationPage(translator, logger, state, lang, page);
    }
    logger.log(`Done translating to ${lang}.`);
}

/**
 * Lists what `translate` would still translate: labels missing in basics.json and documentation pages
 * that are new or changed since their last translation. Exits with 1 if anything is missing.
 *
 * @param languages languages to check, e.g. `de ja`. Without, every language that was translated before (has a folder in src/translations).
 * @param verbose list every missing label and page instead of the first few
 */
export function translateCheckCommand(logger: Logger, languages: string[] = [], verbose: boolean & Flag = false): number {
    const unsupported = languages.filter(lang => !languagesMap[lang]);
    if (unsupported.length) {
        logger.error(`Unsupported language: ${unsupported.join(', ')}. Supported: ${Object.keys(languagesMap).join(', ')}`);
        return 1;
    }
    if (!languages.length) languages = Object.keys(languagesMap).filter(lang => existsSync(path.join(translationsDir, lang)));

    const labels = collectBasicsLabels();
    const labelSet = new Set(labels);
    const pages = translatablePages();
    const hashes = new Map(pages.map(page => [page, pageHash(page)]));
    const list = (title: string, items: string[]) => {
        const shown = verbose ? items : items.slice(0, 5);
        const lines = shown.map(v => `    ${v.length > 100 ? v.slice(0, 100) + '...' : v}`);
        if (shown.length < items.length) lines.push(`    ... and ${items.length - shown.length} more (--verbose lists all)`);
        logger.log(`  ${title}:\n${lines.join('\n')}`);
    };
    let incomplete = false;

    for (const lang of languages) {
        const translations = readTranslationsFile(lang, 'basics');
        const state = readState(lang);
        const missingLabels = labels.filter(label => !translations[label]);
        const outdatedPages = pages.filter(page => state[page] !== hashes.get(page));
        const unused = Object.keys(translations).filter(label => !labelSet.has(label));

        const ok = !missingLabels.length && !outdatedPages.length;
        if (!ok) incomplete = true;
        logger.log(
            `${lang}: ${ok ? 'complete' : 'incomplete'}, ${missingLabels.length} of ${labels.length} labels missing, ` +
                `${outdatedPages.length} of ${pages.length} pages new or changed, ${unused.length} unused labels`,
        );
        if (missingLabels.length) list('missing labels', missingLabels);
        if (outdatedPages.length) list('new or changed pages', outdatedPages);
    }

    if (incomplete) logger.log(`Run \`npm run translate <lang>\` to translate what is missing.`);
    return incomplete ? 1 : 0;
}
