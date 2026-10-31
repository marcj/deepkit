import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Page } from '@app/common/models';
import { MarkdownParser } from '@app/common/markdown';
import { getCurrentDirName } from '@deepkit/core';
import { findParentPath } from '@deepkit/app';

const pagesDir = findParentPath('src/pages', getCurrentDirName()) || '';
const translationLanguages = ['zh', 'ko', 'ja', 'de'];

export class PageProcessor {
    constructor(protected parser: MarkdownParser) {
    }

    async read(url: string, lang: string = 'en'): Promise<string> {
        return (await this.readWithLanguage(url, lang)).content;
    }

    /** The translation of the page, or the English original if there is none. */
    async readWithLanguage(url: string, lang: string = 'en'): Promise<{ content: string; lang: string }> {
        url = url.replace(/[^a-zA-Z0-9\-_\/]/g, '');
        const file = url + '.md';
        const originalPath = join(pagesDir, file);
        const translated = join(pagesDir, '../translations', lang, file);
        if (lang === 'en') return { content: await readFile(originalPath, 'utf8'), lang: 'en' };
        try {
            return { content: await readFile(translated, 'utf8'), lang };
        } catch {
            return { content: await readFile(originalPath, 'utf8'), lang: 'en' };
        }
    }

    async parse(url: string, lang: string): Promise<Page> {
        await this.parser.load();
        const { content, lang: contentLang } = await this.readWithLanguage(url, lang);
        const page = this.parser.parse(content);
        page.url = url;
        page.lang = contentLang;
        page.languages = ['en', ...translationLanguages.filter(v => existsSync(join(pagesDir, '../translations', v, url.replace(/[^a-zA-Z0-9\-_\/]/g, '') + '.md')))];
        return page;
    }
}
