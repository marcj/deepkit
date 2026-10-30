import { readFileSync } from 'fs';
import path from 'path';

import { findParentPath } from '@deepkit/app';
import { getCurrentDirName } from '@deepkit/core';

const translationsDir = findParentPath('src/translations', getCurrentDirName()) || '';

export function readTranslationsFile(lang: string, name: string): Record<string, string> {
    const filePath = path.join(translationsDir, lang, `${name}.json`);
    try {
        const content = readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        return {};
    }
}

export function readTranslationDocumentationPage(lang: string, page: string): string {
    const filePath = path.join(translationsDir, 'documentation', lang, page);
    try {
        return readFileSync(filePath, 'utf8');
    } catch (error) {
        return '';
    }
}
