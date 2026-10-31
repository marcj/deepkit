// import algoliasearch, { SearchClient } from 'algoliasearch';
// import { AppConfig } from "@app/server/config";
import { findParentPath } from '@deepkit/app';
import glob from 'tiny-glob';
import { bodyToString, DocPageContent, Page, projectMap } from '@app/common/models';
import { PageProcessor } from '@app/server/page-processor';
import { Database } from '@deepkit/orm';
import { sql } from '@deepkit/sql';

function createIndexEntriesForPage(page: Page, rootPath: string = ''): DocPageContent[] {
    const entries: DocPageContent[] = [];
    let id = 0;
    if (!page.url) return entries;

    const scores: { [tag: string]: number } = {
        'h1': 10,
        'h2': 9,
        'h3': 8,
        'h4': 7,
        'h5': 6,
        'pre': -1,
    }

    if (!page.body.children) return entries;

    const path: string[] = [];
    let i = 0;

    for (const section of page.body.children) {
        if ('string' === typeof section) continue;
        if (!section.children) continue;
        if (section.tag.startsWith('h')) {
            const level = parseInt(section.tag.substr(1));
            if (path.length > level - 1) path.splice(level - 1);
            path.push(bodyToString(section.children));
        } else {
            const p = path.slice();
            if (rootPath) p.unshift(rootPath);

            const content = new DocPageContent(bodyToString(section.children), page.url);
            content.path = p.map(v => projectMap[v] || v).join(', ');
            content.title = page.title || '';
            content.score = scores[section.tag] || 0;
            content.idx = i++;
            if (section.tag) content.tag = section.tag;
            entries.push(content);
        }
    }

    return entries;
}

export class Search {
    // client: SearchClient

    constructor(
        private database: Database,
        protected page: PageProcessor,
        // algoliaAppId: AppConfig['algoliaAppId'],
        // algoliaApiKey: AppConfig['algoliaApiKey'],
    ) {
        // this.client = algoliasearch(algoliaAppId, algoliaApiKey);
    }

    async find(query: string): Promise<DocPageContent[]> {
        //replace user query to fulltext search query in postgres format
        const search = query.trim().replace(/ +/g, ' & ');

        const docResult = await this.database.raw<DocPageContent>(sql`
SELECT *,
       ts_rank(path_tsvector, to_tsquery('english', ${search})) AS path_rank,
       ts_rank(content_tsvector, to_tsquery('english', ${search})) AS content_rank,
       score + ((ts_rank(path_tsvector, to_tsquery('english', ${search})) * 4.5) +
                ts_rank(content_tsvector, to_tsquery('english', ${search}))) as rank
FROM doc_page_content
WHERE (content_tsvector || path_tsvector @@ to_tsquery('english', ${search}))
ORDER BY rank DESC;
`).find();

        //highlight keywords in the content
        for (const doc of docResult) {
            doc.content = doc.content.replace(new RegExp(`(${query.split(' ').join('|')})`, 'gi'), '<span class="highlight">$1</span>');
        }

        return docResult;
    }

    async index() {
        // const pages = this.client.initIndex('pages');
        // pages.saveObjects()
        await this.database.query(DocPageContent).deleteMany();

        //go through all .md files in src/pages
        const pagesDir = findParentPath('src/pages', process.cwd());
        if (!pagesDir) throw new Error('Could not find pages directory');

        const files = await glob('**/*.md', { cwd: pagesDir });
        const session = this.database.createSession();

        for (const file of files) {
            if (!file.startsWith('documentation/')) continue;
            const page = await this.page.parse(file.replace('.md', ''), 'en');
            // console.log(json);
            page.url = file.replace('.md', '');
            // const body = bodyToString(page.body);
            const categories = file.split('/');
            const category = categories.length > 2 ? categories[1] : '';
            const entries = createIndexEntriesForPage(page, category);
            // console.log(entries);

            session.add(...entries);
        }

        await session.commit();
    }
}
