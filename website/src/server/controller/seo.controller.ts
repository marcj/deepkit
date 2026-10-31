import { existsSync } from 'fs';
import { join } from 'path';

import { BlogEntity } from '@app/common/models';
import { docs } from '@app/common/docs';
import { translationsDir } from '@app/server/translations';
import { http, Response } from '@deepkit/http';
import { Database } from '@deepkit/orm';

export const siteUrl = 'https://deepkit.io';
export const languages = ['en', 'zh', 'ko', 'ja', 'de'];

/** The package pages of the old website (/library/<id>) and their documentation. */
const libraryDocs: Record<string, string> = {
    'api-console': 'framework/api-console',
    app: 'app',
    broker: 'broker',
    framework: 'framework',
    http: 'http/getting-started',
    injector: 'dependency-injection',
    'orm-browser': 'orm/orm-browser',
    orm: 'orm/getting-started',
    rpc: 'rpc/getting-started',
    template: 'template',
    type: 'runtime-types/getting-started',
};

/**
 * Target of a permanent redirect for URLs that moved or were removed, so search engines move their index and
 * links to the new URL.
 */
export function getPermanentRedirect(url: string): string | undefined {
    const queryStart = url.indexOf('?');
    const path = queryStart === -1 ? url : url.substring(0, queryStart);
    const query = queryStart === -1 ? '' : url.substring(queryStart);
    let match: RegExpMatchArray | null;

    if (path === '/en' || path === '/en/') return '/' + query;
    if (path === '/library' || path === '/library/' || path === '/enterprise' || path === '/community') return '/';
    if ((match = path.match(/^\/library\/([a-z-]+)/))) {
        return libraryDocs[match[1]] ? `/en/documentation/${libraryDocs[match[1]]}` : '/en/documentation';
    }
    // community questions and examples were removed
    if ((match = path.match(/^(?:\/([a-z]{2}))?\/documentation\/questions(\/|$)/))) return `/${match[1] || 'en'}/documentation`;
    if ((match = path.match(/^(?:\/([a-z]{2}))?\/documentation\/(?:([a-z-]+)\/)?examples(\/|$)/))) {
        return `/${match[1] || 'en'}/documentation${match[2] ? '/' + match[2] : ''}`;
    }
    // documentation and blog are under the language since the translations
    if (/^\/(documentation|blog)(\/|$)/.test(path)) return '/en' + url;
    return;
}

function xmlEscape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isTranslated(lang: string, page: string): boolean {
    return existsSync(join(translationsDir, lang, 'documentation', (page || 'index') + '.md'));
}

export class SeoController {
    constructor(protected database: Database) {}

    @http.GET('/robots.txt')
    robots() {
        return new Response(
            ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', '', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n'),
            'text/plain; charset=utf-8',
        );
    }

    @http.GET('/sitemap.xml')
    async sitemap() {
        const entries: string[] = [];
        const add = (path: string, alternates?: Record<string, string>) => {
            let entry = `<url><loc>${xmlEscape(siteUrl + path)}</loc>`;
            if (alternates) {
                for (const [lang, alternate] of Object.entries(alternates)) {
                    entry += `<xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(siteUrl + alternate)}"/>`;
                }
                entry += `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(siteUrl + alternates.en)}"/>`;
            }
            entries.push(entry + '</url>');
        };

        const startpages: Record<string, string> = {};
        for (const lang of languages) startpages[lang] = lang === 'en' ? '/' : '/' + lang;
        for (const path of Object.values(startpages)) add(path, startpages);

        for (const category of docs) {
            for (const page of category.pages) {
                const suffix = page.path ? '/' + page.path : '';
                // pages without translation show the English text, their canonical URL is the English one
                const alternates: Record<string, string> = { en: `/en/documentation${suffix}` };
                if (!page.path.startsWith('desktop-ui')) {
                    for (const lang of languages) {
                        if (lang !== 'en' && isTranslated(lang, page.path)) alternates[lang] = `/${lang}/documentation${suffix}`;
                    }
                }
                const translated = Object.keys(alternates).length > 1;
                for (const path of Object.values(alternates)) add(path, translated ? alternates : undefined);
            }
        }

        add('/en/blog');
        const posts = await this.database.query(BlogEntity).filter({ published: true }).find();
        for (const post of posts) add(`/en/blog/${post.slug}`);

        for (const path of ['/benchmarks', '/about-us', '/contact', '/terms', '/data-protection']) add(path);

        const xml =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
            entries.join('\n') +
            '\n</urlset>\n';
        return new Response(xml, 'application/xml; charset=utf-8');
    }
}
