import { rpc } from '@deepkit/rpc';
import { BlogEntity, Content, DocPageContent, DocPageResult, Page } from '@app/common/models';
import { findParentPath } from '@deepkit/app';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Search } from '@app/server/search';
import { MarkdownParser } from '@app/common/markdown';
import { PageProcessor } from '@app/server/page-processor';
import { Database } from '@deepkit/orm';
import { UserAuthentication } from '@app/server/user-authentication';
import { docs } from '@app/common/docs';
import { readTranslationsFile } from '@app/server/translations';


function different(a?: string | Content, b?: string | Content): boolean {
    if ('string' === typeof a || 'undefined' === typeof a) {
        return a !== b;
    }

    if ('string' === typeof b || 'undefined' === typeof b) {
        return true;
    }

    if (a.tag !== b.tag) return true;
    if (a.children?.length !== b.children?.length) return true;

    if (a.children) {
        if (!b.children) return true;
        for (let i = 0; i < a.children.length; i++) {
            if (different(a.children[i], b.children[i])) return true;
        }
    }

    return false;
}

function createDocPageResult(
    markdownParser: MarkdownParser,
    content: DocPageContent,
): DocPageResult {
    return {
        url: content.url,
        title: content.title,
        path: content.path,
        tag: content.tag,
        content: markdownParser.parse(content.content).body,
    };
}

@rpc.controller('main')
export class MainController {
    constructor(
        private searcher: Search,
        private page: PageProcessor,
        private database: Database,
        private markdownParser: MarkdownParser,
        private userAuthentication: UserAuthentication,
    ) {
    }

    @rpc.action()
    async login(email: string, password: string): Promise<string> {
        return await this.userAuthentication.login(email, password);
    }

    @rpc.action()
    async getAsset(path: string): Promise<string> {
        //remove all special characters and remove all ../...../...
        path = path.replace(/[^a-zA-Z0-9\-_.\/]/g, '').replace(/\.\.+/g, '.');
        const dir = await findParentPath('src/assets/');
        if (!dir) throw new Error('Assets folder not found');
        const file = join(dir, path);
        const content = await readFile(file, 'utf8');
        return content;
    }



    @rpc.action()
    async search(query: string): Promise<{ pages: DocPageResult[] }> {
        const hits = await this.searcher.find(query);
        return { pages: hits.map(v => createDocPageResult(this.markdownParser, v)) };
    }


    protected book?: Page;

    @rpc.action()
    async getBook(): Promise<Page> {
        if (this.book) return this.book;

        const content: string[] = [];
        for (const chapter of docs) {
            if (chapter.book === false) continue;
            for (const page of chapter.pages) {
                if (page.book === false) continue;
                if (page.path.startsWith('desktop-ui/')) continue;
                const fileContent = await this.page.read('documentation/' + page.path);
                // content.push(`## ${chapterTitle} - ${page.title}`);
                content.push(fileContent);
            }
        }

        return this.book = this.markdownParser.parse(content.join('\n'));
    }

    @rpc.action()
    async getPage(url: string, lang: string): Promise<Page> {
        return await this.page.parse(url, lang);
    }

    @rpc.action()
    async getBlogPosts(): Promise<BlogEntity[]> {
        return await this.database.query(BlogEntity)
            .filter({ published: true })
            .orderBy('publishedAt', 'desc')
            .find();
    }

    @rpc.action()
    async getBlogPost(slug: string): Promise<BlogEntity | undefined> {
        return await this.database.query(BlogEntity)
            .filter({ published: true, slug })
            .findOneOrUndefined();
    }

    @rpc.action()
    async getTranslation(lang: string, name: string): Promise<Record<string, string>> {
        // make sure its ascii only, no special characters, a-Z
        lang = lang.replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
        name = name.replace(/[^a-zA-Z0-9\-]/g, '').toLowerCase();
        return readTranslationsFile(lang, name);
    }
}
