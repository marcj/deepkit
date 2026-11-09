import { existsSync } from 'fs';
import { join } from 'path';

import { BlogEntity, bodyToString, parseBody } from '@app/common/models';
import { docs, texts } from '@app/common/docs';
import { getLanguage, languageCodes as languages } from '@app/common/languages';
import { siteUrl } from '@app/common/seo';
import { OgImageContent, renderOgImage } from '@app/server/og-image';
import { PageProcessor } from '@app/server/page-processor';
import { readTranslationsFile, translationsDir } from '@app/server/translations';
import { http, HttpRegExp, Response } from '@deepkit/http';
import { Database } from '@deepkit/orm';

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
 * Whether the path of the URL has an invalid percent-encoding, which no page can have.
 */
export function isMalformedUrl(url: string): boolean {
    try {
        decodeURIComponent(url.split('?')[0]);
        return false;
    } catch {
        return true;
    }
}

/**
 * Target of a permanent redirect for URLs that moved or were removed, so search engines move their index and
 * links to the new URL.
 */
export function getPermanentRedirect(url: string): string | undefined {
    const queryStart = url.indexOf('?');
    const path = queryStart === -1 ? url : url.substring(0, queryStart);
    const query = queryStart === -1 ? '' : url.substring(queryStart);
    let match: RegExpMatchArray | null;

    // collapsed, so that the target can't be a protocol-relative URL to another host
    if (path.includes('//') && !path.startsWith('/api/')) return path.replace(/\/{2,}/g, '/') + query;
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
    // renamed documentation pages
    const renamed: Record<string, string> = {
        // the CLI documentation is part of App
        cli: 'app',
        'cli/getting-started': 'app',
        'cli/events': 'app/events',
        'package/mongodb': 'package/mongo',
        'package/filesystem-s3': 'package/filesystem-aws-s3',
        'dependency-injection/dependency-injection': 'dependency-injection',
        'runtime-types/runtime-types': 'runtime-types',
        topsort: 'package/topsort',
        event: 'package/event',
    };
    if ((match = path.match(/^(?:\/([a-z]{2}))?\/documentation\/(.+?)(\.md)?$/)) && renamed[match[2]]) {
        return `/${match[1] || 'en'}/documentation/${renamed[match[2]]}${match[3] || ''}`;
    }
    // the documentation of runtime types was called "type" before 2023
    if ((match = path.match(/^(?:\/([a-z]{2}))?\/documentation\/type(\/|$)/))) return `/${match[1] || 'en'}/documentation/runtime-types`;
    if (path === '/docs' || path === '/docs/') return '/en/documentation';
    // markdown links of the documentation resolved against the root, e.g. /framework.md, /runtime-types/validation.md
    if ((match = path.match(/^\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)(\.md)?$/)) && !/^[a-z]{2}(\/|$)/.test(match[1])) {
        const page = renamed[match[1]] || match[1];
        if ((match[2] || page === 'framework') && docs.some(category => category.pages.some(v => v.path === page))) {
            return `/en/documentation/${page}${match[2] || ''}`;
        }
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

const staticPages = ['about-us', 'contact', 'terms', 'data-protection'];

/** text of the first paragraph of a blog post (tiptap JSON) */
function firstParagraph(content: any[]): string {
    for (const node of content) {
        if (node.type !== 'paragraph' || !node.content) continue;
        const text = node.content.map((v: any) => v.text || '').join('').trim();
        if (text) return text;
    }
    return '';
}

/** rendered images by page path (~360 KB each), rendering takes ~250 ms */
const ogImages = new Map<string, Promise<Uint8Array>>();

export class SeoController {
    constructor(
        protected database: Database,
        protected pages: PageProcessor,
    ) {}

    /** Section, title and description of the page at the given path, undefined if there is no such page. */
    protected async ogContent(path: string): Promise<OgImageContent | undefined> {
        const url = 'deepkit.io' + (path === '/' ? '' : path);
        let match: RegExpMatchArray | null;

        // start pages
        if (path === '/' || languages.some(v => path === '/' + v)) {
            const t = this.translator(path === '/' ? 'en' : path.substring(1));
            const lang = path === '/' ? 'en' : path.substring(1);
            return { section: '', title: t(texts.heroTitle), description: t(texts.heroText), url, lang };
        }

        if ((match = path.match(/^\/([a-z]{2})\/documentation(?:\/(.+))?$/)) && languages.includes(match[1])) {
            const lang = match[1], pagePath = match[2] || '';
            const t = this.translator(lang);
            const category = docs.find(c => c.pages.some(p => p.path === pagePath));
            if (!category) return;
            const page = await this.pages.parse('documentation/' + (pagePath || 'index'), lang).catch(() => undefined);
            if (!page) return;
            const section = t(texts.docs) + (category.category ? ' · ' + t(category.category) : '');
            return { section, title: page.title || t(texts.docs), description: bodyToString(parseBody(page.body).subline), url, lang: page.lang };
        }

        if ((match = path.match(/^\/([a-z]{2})\/blog(?:\/([a-z0-9-]+))?$/)) && languages.includes(match[1])) {
            if (!match[2]) {
                return { section: 'Blog', title: 'Deepkit Blog', description: 'Releases, background and articles about Deepkit and runtime types in TypeScript.', url };
            }
            const post = await this.database.query(BlogEntity).filter({ published: true, slug: match[2] }).findOneOrUndefined();
            if (!post) return;
            const date = post.publishedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            return { section: 'Blog · ' + date, title: post.title, description: firstParagraph(post.content), url };
        }

        if (path === '/benchmarks') {
            return {
                section: 'Benchmarks',
                title: 'Deepkit performance, release by release',
                description: 'Validation, serialization, database, HTTP and dependency injection, compared with other libraries and across releases on the same machine.',
                url,
            };
        }

        if (staticPages.includes(path.substring(1))) {
            const page = await this.pages.parse('static/' + path.substring(1), 'en').catch(() => undefined);
            if (!page) return;
            return { section: '', title: page.title || '', description: bodyToString(parseBody(page.body).subline), url };
        }
        return;
    }

    protected translator(lang: string): (text: string) => string {
        const translations = lang === 'en' ? {} : readTranslationsFile(lang, 'basics');
        return text => translations[text] || text;
    }

    /** Social preview image (og:image) of a page, e.g. /og/en/documentation/orm.png for /en/documentation/orm. */
    @http.GET('/og/:path')
    async ogImage(path: HttpRegExp<string, '[a-z0-9_/-]+\\.png'>) {
        let pagePath = '/' + path.substring(0, path.length - '.png'.length);
        if (pagePath === '/index') pagePath = '/';

        let image = ogImages.get(pagePath);
        if (!image) {
            // unknown pages get the image of the start page, without filling the cache with arbitrary paths
            let content = await this.ogContent(pagePath);
            if (!content) {
                pagePath = '/';
                image = ogImages.get(pagePath);
                content = await this.ogContent(pagePath);
            }
            if (!image) {
                image = renderOgImage(content!);
                if (ogImages.size >= 300) ogImages.delete(ogImages.keys().next().value!);
                ogImages.set(pagePath, image);
                image.catch(() => ogImages.delete(pagePath));
            }
        }
        return new Response(await image, 'image/png').header('cache-control', 'public, max-age=86400');
    }

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
                    entry += `<xhtml:link rel="alternate" hreflang="${getLanguage(lang)?.tag || lang}" href="${xmlEscape(siteUrl + alternate)}"/>`;
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
