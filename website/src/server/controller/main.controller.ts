import { rpc } from '@deepkit/rpc';
import { BlogEntity, CommunityMessage, CommunityQuestion, CommunityQuestionListItem, Content, DocPageContent, DocPageResult, Page, UiCodeExample } from '@app/common/models';
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

function createUiExample(
    markdownParser: MarkdownParser,
    example: CommunityMessage,
): UiCodeExample {
    return {
        title: example.title,
        category: example.category,
        url: example.meta.url || '',
        slug: example.slug,
        content: markdownParser.parse(example.content).body,
    };
}

function createCommunityQuestion(
    markdownParser: MarkdownParser,
    question: CommunityMessage,
    messages: CommunityMessage[],
): CommunityQuestion {
    return {
        id: question.id,
        created: question.created,
        discordUrl: question.discordUrl,
        answerDiscordUrl: messages[0]?.discordUrl || '',
        category: question.category,
        votes: question.votes,
        title: question.title,
        type: question.type,
        slug: question.slug,
        allowEdit: false,
        user: question.userDisplayName,
        userAvatar: question.discordUserAvatarUrl,
        content: markdownParser.parse(question.content).body,
        messages: messages.map(v => ({ id: v.id, user: v.userDisplayName, userAvatar: v.discordUserAvatarUrl, content: markdownParser.parse(v.content).body })),
    };
}

function createCommunityQuestionListItem(
    question: CommunityMessage,
): CommunityQuestionListItem {
    return {
        id: question.id,
        created: question.created,
        slug: question.slug,
        discordUrl: question.discordUrl,
        category: question.category,
        votes: question.votes,
        title: question.title,
        user: question.userDisplayName,
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
    async getQuestion(slug: string, authId?: string): Promise<CommunityQuestion> {
        const message = await this.database.query(CommunityMessage).filter({ slug, type: { $ne: 'example' } }).findOne();
        const messages = await this.database.query(CommunityMessage).filter({ thread: message, type: { $ne: 'edit' } }).orderBy('created', 'asc').find();
        const question = createCommunityQuestion(this.markdownParser, message, messages);
        question.allowEdit = message.authId === authId;
        return question;
    }

    @rpc.action()
    async getQuestions(): Promise<{ top: CommunityQuestionListItem[], newest: CommunityQuestionListItem[] }> {
        const top = await this.database.query(CommunityMessage)
            .filter({ order: 1, type: { $ne: 'example' } })
            .orderBy('votes', 'desc')
            .limit(100)
            .find();

        const newest = await this.database.query(CommunityMessage)
            .filter({ order: 1, type: { $ne: 'example' } })
            .orderBy('created', 'desc')
            .limit(15)
            .find();

        return {
            top: top.map(v => createCommunityQuestionListItem(v)),
            newest: newest.map(v => createCommunityQuestionListItem(v)),
        };
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
    async search(query: string): Promise<{ pages: DocPageResult[], community: CommunityQuestion[] }> {
        const hits = await this.searcher.find(query);

        return {
            pages: hits.pages.map(v => createDocPageResult(this.markdownParser, v)),
            community: hits.community.map(v => createCommunityQuestion(this.markdownParser, v, [])),
        };
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
    async getFAQ(category: string): Promise<CommunityQuestion[]> {
        const questions = await this.database.query(CommunityMessage)
            .filter({ type: 'answer', category, order: 1, assistant: true })
            .limit(5)
            .orderBy('votes', 'desc')
            .orderBy('id', 'asc')
            .find();

        return questions.map(v => createCommunityQuestion(this.markdownParser, v, []));
    }

    @rpc.action()
    async getExamples(category: string = '', withContent: boolean = false, top: number = 5): Promise<UiCodeExample[]> {
        let query = this.database.query(CommunityMessage);
        if (category) {
            query = query.filter({ category });
        }

        const examples = await query
            .filter({ type: 'example' })
            .limit(top)
            .orderBy('votes', 'desc')
            .orderBy('id', 'asc')
            .find();

        return examples.map(v => createUiExample(this.markdownParser, v));
    }

    @rpc.action()
    async getExample(category: string, slug: string): Promise<UiCodeExample> {
        const example = await this.database.query(CommunityMessage).filter({ type: 'example', category, slug }).findOne();
        return createUiExample(this.markdownParser, example);
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
