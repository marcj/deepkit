// The documentation for LLMs and coding agents (https://llmstxt.org): /llms.txt as index, /llms-full.txt with all
// guides in one file, and every documentation page as markdown under its URL plus .md, package pages including
// their API reference.
import { docs, libraries } from '@app/common/docs';
import { siteUrl } from '@app/common/seo';
import { PageProcessor } from '@app/server/page-processor';
import { languageCodes } from '@app/common/languages';
import { http, HttpNotFoundError, HttpRegExp, Response } from '@deepkit/http';

interface ApiDoc {
    name: string;
    kind: string;
    type: string;
    description?: string;
    source?: { file: string; line: number };
}

const apiDocs: Record<string, ApiDoc[]> = require('../../../api-docs.json');

const intro = `# Deepkit

> Deepkit is a TypeScript framework with runtime types: its type compiler makes TypeScript types available at runtime, so one type is used for validation, serialization, the database (ORM), HTTP, RPC and dependency injection, without schemas, decorators for dependency injection or code generation.

The complete documentation in one file: [llms-full.txt](${siteUrl}/llms-full.txt)

Important for writing Deepkit code:

- Runtime types need the type compiler in the build: \`"reflection": true\` in tsconfig.json, and \`npx deepkit-type-install\` to install it into TypeScript (or the Vite and Bun plugins). Without it, types are not available at runtime.
- Validation and database options are intersections with the type: \`string & MinLength<3>\`, \`number & PrimaryKey & AutoIncrement\`, \`string & Email\`.
- Dependency injection resolves constructor parameters by their type, interfaces included. No decorators are needed for it.
- HTTP routes and CLI commands take their parameters from the function signature: \`HttpBody<T>\`, \`HttpQuery<T>\`, \`Flag\`.
- A new project: \`npm init @deepkit/app@latest my-app\`.

Every documentation page is available as markdown by adding \`.md\` to its URL, package pages include their API reference.
`;

/** documentation pages that are markdown files (Desktop UI pages are Angular components) */
function markdownPages() {
    return docs.map(category => ({ category: category.category, pages: category.pages.filter(v => !v.path.startsWith('desktop-ui')) }))
        .filter(v => v.pages.length);
}

function pageUrl(path: string, lang: string = 'en'): string {
    return `${siteUrl}/${lang}/documentation${path ? '/' + path : ''}`;
}

/** first sentence of the first paragraph */
function summary(markdown: string): string {
    for (const block of markdown.split(/\n\s*\n/)) {
        const text = block.trim();
        if (!text || /^(#|```|<|!\[|\||-|\*|>)/.test(text)) continue;
        const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ');
        const sentence = plain.match(/^.+?[.!?](\s|$)/)?.[0].trim() || plain;
        return sentence.length > 200 ? sentence.substring(0, 199).replace(/\s+\S*$/, '') + '…' : sentence;
    }
    return '';
}

function apiReference(packageName: string): string {
    const entries = apiDocs[packageName];
    if (!entries?.length) return '';
    const lines = [`## API reference of ${packageName}`, ''];
    for (const entry of entries) {
        lines.push(`### ${entry.name} (${entry.kind})`, '');
        if (entry.description) lines.push(entry.description.trim(), '');
        lines.push('```typescript', entry.type.trim(), '```', '');
        if (entry.source) lines.push(`Source: https://github.com/deepkit/deepkit-framework/blob/master/${entry.source.file}#L${entry.source.line}`, '');
    }
    return lines.join('\n');
}

/**
 * The markdown of a page without the custom tags of the website. `full`: the API reference is
 * inserted instead of the <api-docs> tag, otherwise a link to the page with it.
 */
function cleanMarkdown(markdown: string, path: string, full: boolean): string {
    return markdown
        .replace(/<api-docs package="([^"]+)"><\/api-docs>/g, (_, name) =>
            full ? apiReference(name) : `API reference of ${name}: ${pageUrl(path)}.md`,
        )
        .replace(/<app-image src="([^"]+)"><\/app-image>/g, (_, src) => `![](${siteUrl}${src})`)
        .replace(/<\/?app-images>/g, '')
        .trim() + '\n';
}

/** relative links of a page as absolute URLs, resolved from the location of its markdown file */
function absoluteLinks(markdown: string, path: string, lang: string = 'en'): string {
    const base = `${siteUrl}/${lang}/documentation/${path || 'index'}.md`;
    return markdown.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, link) => {
        // links like /documentation/app.md are without language
        if (link.startsWith('/documentation')) link = `/${lang}${link}`;
        // Desktop UI pages are Angular components without markdown version
        if (link.includes('desktop-ui/')) link = link.replace(/\.md($|#)/, '$1');
        return `](${new URL(link, base).href})`;
    });
}

function markdownResponse(content: string, canonical: string) {
    return new Response(content, 'text/markdown; charset=utf-8')
        // search engines should index the HTML page, not the markdown
        .header('link', `<${canonical}>; rel="canonical"`)
        .header('cache-control', 'public, max-age=3600');
}

export class LlmsController {
    constructor(protected pages: PageProcessor) {}

    @http.GET('/llms.txt')
    async index() {
        const lines = [intro];
        for (const category of markdownPages()) {
            lines.push(`## ${category.category || 'Overview'}`, '');
            for (const page of category.pages) {
                const markdown = await this.pages.read('documentation/' + (page.path || 'index')).catch(() => '');
                if (!markdown) continue;
                let title: string = page.title, description = summary(markdown);
                if (page.path.startsWith('package/')) {
                    // package pages are mostly their API reference, the description comes from the library catalog
                    const name = '@deepkit/' + page.path.substring('package/'.length);
                    const library = libraries.flatMap(v => v.items).find(v => v.package === name);
                    title = name;
                    description = (library ? library.description + ' ' : '') + (apiDocs[name]?.length ? 'API reference.' : '');
                }
                lines.push(`- [${title}](${pageUrl(page.path)}.md)${description ? ': ' + description.trim() : ''}`);
            }
            lines.push('');
        }
        lines.push('## Optional', '');
        lines.push(`- [Benchmarks](${siteUrl}/benchmarks): performance compared with other libraries and across releases`);
        lines.push(`- [Blog](${siteUrl}/en/blog): releases and articles`);
        lines.push(`- [Source code](https://github.com/deepkit/deepkit-framework)`, '');
        return new Response(lines.join('\n'), 'text/markdown; charset=utf-8').header('cache-control', 'public, max-age=3600');
    }

    @http.GET('/llms-full.txt')
    async full() {
        const parts = [intro];
        for (const category of markdownPages()) {
            for (const page of category.pages) {
                const markdown = await this.pages.read('documentation/' + (page.path || 'index')).catch(() => '');
                if (!markdown) continue;
                parts.push(`---\n\nSource: ${pageUrl(page.path)}\n\n` + absoluteLinks(cleanMarkdown(markdown, page.path, false), page.path));
            }
        }
        return new Response(parts.join('\n'), 'text/markdown; charset=utf-8').header('cache-control', 'public, max-age=3600');
    }

    /** /en/documentation.md and /de/documentation/orm/getting-started.md: the page as markdown, translated if available */
    @http.GET('/:lang/documentation:path')
    async page(lang: HttpRegExp<string, '[a-z]{2}'>, path: HttpRegExp<string, '(?:/[a-z0-9_/-]+)?\\.md'>) {
        if (!languageCodes.includes(lang)) throw new HttpNotFoundError();
        const pagePath = path.replace(/\.md$/, '').replace(/^\//, '');
        // the pattern of path allows no "..", so only files of the documentation are reachable
        if (pagePath.startsWith('desktop-ui')) throw new HttpNotFoundError();
        const { content } = await this.pages.readWithLanguage('documentation/' + (pagePath || 'index'), lang).catch(() => ({ content: '' }));
        if (!content) throw new HttpNotFoundError();
        return markdownResponse(absoluteLinks(cleanMarkdown(content, pagePath, true), pagePath, lang), pageUrl(pagePath, lang));
    }
}
