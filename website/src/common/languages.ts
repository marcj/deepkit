export interface Language {
    /** URL prefix and translation folder, e.g. /de/documentation and src/translations/de */
    code: string;
    label: string;
    /** BCP 47 tag for `<html lang>`, `hreflang` and the sitemap */
    tag: string;
    /** Open Graph locale */
    ogLocale: string;
}

/**
 * The languages of the website: language switcher, SEO tags, sitemap and `npm run translate`.
 * English is the original, all others are translated.
 */
export const languages: Language[] = [
    { code: 'en', label: 'English', tag: 'en', ogLocale: 'en_US' },
    { code: 'zh', label: '中文 (Chinese)', tag: 'zh-Hans', ogLocale: 'zh_CN' },
    { code: 'ko', label: '한국어 (Korean)', tag: 'ko', ogLocale: 'ko_KR' },
    { code: 'ja', label: '日本語 (Japanese)', tag: 'ja', ogLocale: 'ja_JP' },
    { code: 'de', label: 'Deutsch (German)', tag: 'de', ogLocale: 'de_DE' },
];

export const languageCodes: string[] = languages.map(v => v.code);

/** all languages except the English original */
export const translatedLanguages: Language[] = languages.filter(v => v.code !== 'en');

export function getLanguage(code: string): Language | undefined {
    return languages.find(v => v.code === code);
}
