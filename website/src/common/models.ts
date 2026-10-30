import { AutoIncrement, DatabaseField, entity, Index, PrimaryKey, Reference, UUID, uuid } from '@deepkit/type';

export interface Content {
    tag: string;
    props?: { [name: string]: any };
    children?: (string | Content)[];
}

export const projectMap: { [name: string]: string } = {
    'framework': 'Deepkit Framework',
    'runtime-types': 'Deepkit Runtime Types',
    'dependency-injection': 'Deepkit Injector',
    'cli': 'Deepkit CLI',
    'http': 'Deepkit HTTP',
    'rpc': 'Deepkit RPC',
    'database': 'Deepkit ORM',
    'desktop-ui': 'Desktop UI',
    'general': 'General',
    'performance': 'Performance',
    'security': 'Security',
    'testing': 'Testing',
    'validation': 'Validation',
    'template': 'Template',
    'introduction': 'Introduction',
    'migration': 'Migration',
    'orm': 'Deepkit ORM',
    'app': 'Deepkit App',
    'filesystem': 'Deepkit Filesystem',
    'broker': 'Deepkit Broker',
};

export function link(q: CommunityQuestion) {
    if (q.type === 'example') return `/documentation/${q.category}/examples/${q.slug}`;

    return `/documentation/questions/post/${q.id}`;
}

export function bodyToString(body?: string | Content | (string | Content)[]): string {
    if (!body) return '';
    if ('string' === typeof body) return body;
    if (Array.isArray(body)) {
        return body.map(v => bodyToString(v)).join('');
    }
    let result = '';
    if (body.children) {
        for (const child of body.children) {
            if ('string' === typeof child) {
                result += child;
            } else {
                result += bodyToString(child);
            }
        }
    }

    return result;
}

export function parseBody(body: Content | Content['children']): { title: string, subline?: Content, intro: Content[], rest: Content[] } {
    let title = '';
    let subline: Content | undefined = undefined;
    const intro: Content[] = [];
    const rest: Content[] = [];
    const children = Array.isArray(body) ? body : body?.children ?? [];

    for (const child of children) {
        if (!child || 'string' === typeof child) continue;
        if (!title && child.tag === 'h1') {
            title = child.children ? child.children[0] as string : '';
            continue;
        } else if (child.tag === 'p') {
            if (!subline) {
                subline = child;
                continue;
            } else if (!intro.length) {
                intro.push(child);
                continue;
            }
        }

        if (rest.length === 0 && intro.length === 1) {
            if (child.tag === 'video' || child.tag === 'app-screens') {
                intro.push(child);
                continue;
            }
        }
        rest.push(child);
    }

    return { title, subline, intro: intro || { tag: 'p', children: [] }, rest };
}

export interface Page {
    title?: string;
    params: { [name: string]: string };
    url?: string;
    date?: Date;
    body: Content;
}

// export interface IndexEntry {
//     objectID: string; // Required by Algolia for unique identification
//     title: string;
//     url: string;
//     tag: string;
//     props: { [name: string]: any };
//     fragment?: string;
//     path: string[]; //e.g. framework, database, orm, http, etc
//     content: string; //the paragraph
//     _highlightResult?: {
//         [name: string]: {
//             fullyHighlighted?: boolean
//             matchLevel?: string,
//             matchedWords?: string[],
//             value?: string
//         }
//     };
// }

// @entity.collection('community_questions')
// export class CommunityThread {
//     id: UUID & PrimaryKey = uuid();
//     created: Date = new Date;
//     title: string = '';
//
//     discordChannelId?: string;
//     discordMessageId?: string;
//     discordThreadId?: string & Index;
//
//     constructor(
//         public userId: string,
//         public displayName: string,
//     ) {
//     }
// }

function slugify(text: string) {
    return text
        .toLowerCase()
        .replace(/ /g, '-')
        .replace(/[^\w-]+/g, '');
}

@entity.collection('doc_page_content')
export class DocPageContent {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;
    score: number = 0;
    path: string = '';
    idx: number = 0;
    path_tsvector: string & DatabaseField<{ type: 'tsvector' }> = '';
    content_tsvector: string & DatabaseField<{ type: 'tsvector' }> = '';

    title: string = '';
    tag: string = 'p';

    constructor(
        public content: string,
        public url: string = '',
    ) {
    }
}

export interface DocPageResult {
    path: string;
    url: string;
    title: string;
    tag: string;
    content: Content;
}

@entity.collection('community_message')
export class CommunityMessage {
    id: number & PrimaryKey & AutoIncrement = 0;
    created: Date = new Date;
    votes: number = 0;
    order: number & Index = 0; //0 means first message, initial question, 1 means the first question
    assistant: boolean = false;

    source: ('markdown' | 'community') & DatabaseField<{ type: 'text' }> = 'community';

    type: string & Index = 'question'; //question, answer, reject, edit, example
    title: string = '';

    category: string & Index = '';
    slug: string & Index = '';

    title_tsvector: string & DatabaseField<{ type: 'tsvector' }> = '';
    content_tsvector: string & DatabaseField<{ type: 'tsvector' }> = '';

    authId: UUID = uuid();

    discordUserAvatarUrl: string = '';
    discordUrl: string = '';
    discordChannelId?: string;
    discordMessageId?: string & Index;
    discordThreadId?: string & Index;

    meta: { [name: string]: any } = {};

    constructor(
        public userId: string,
        public userDisplayName: string,
        public content: string = '',
        public thread?: CommunityMessage & Reference,
    ) {
    }

    setTitle(title: string) {
        this.title = title;
        this.slug = slugify(title);
    }
}

export interface CommunityQuestionListItem {
    id: number;
    slug: string;
    created: Date;
    discordUrl: string;
    category: string;
    votes: number;
    title: string;
    user: string;
}

export interface CommunityQuestionMessage {
    id: number,
    user: string,
    userAvatar: string,
    content: Content
}

export interface CommunityQuestion {
    id: number;
    created: Date;
    discordUrl: string;
    answerDiscordUrl: string;
    category: string;
    type: string; //answer|example

    slug: string;

    authId?: string; //returned on initially creating a question, which is stored on client side
    allowEdit: boolean; //if the authId matches, the user is allowed to edit the question

    votes: number;
    title: string;
    user: string;
    userAvatar: string;
    content: Content;
    messages: CommunityQuestionMessage[];
}

export interface QuestionAnswer {
    title: string;
    answer: Content;
}

// @entity.collection('code_example')
// export class CodeExample {
//     id: number & PrimaryKey & AutoIncrement = 0;
//     created: Date = new Date;
//
//     source: ('markdown' | 'community') & DatabaseField<{type: 'text'}> = 'community';
//     votes: number = 0;
//     category: string & Index = '';
//     slug: string & Index = '';
//
//     //external URL, e.g. github gist or github repo
//     url: string = '';
//
//     constructor(
//         public title: string,
//         public content: string
//     ) {
//     }
// }

export interface UiCodeExample {
    title: string;
    category: string;
    slug: string;
    url: string;
    content?: Content;
}


export const magicSeparator = '##-------------------------------------------------##';

/**
 * Loosely describes a JSON representation of a Prosemirror document or node
 */
type JSONContent = {
    type?: string;
    attrs?: Record<string, any>;
    content?: JSONContent[];
    marks?: {
        type: string;
        attrs?: Record<string, any>;
        [key: string]: any;
    }[];
    text?: string;
    [key: string]: any;
};

function serialize(key: string, value: any) {
    return value === null ? undefined : value;
}

export function isBlockEqual(a: JSONContent, b: JSONContent): boolean {
    return JSON.stringify(a, serialize) === JSON.stringify(b, serialize);
    // if (a.content?.length !== b.content?.length) return false;
    // if (a.content && b.content) {
    //     for (let i = 0; i < (a.content?.length || 0); i++) {
    //         if (!isBlockEqual(a.content[i], b.content[i])) return false;
    //     }
    // }
}

export function isBlocksEqual(a?: JSONContent[], b?: JSONContent[]): boolean {
    if (!a || !b) {
        return false;
    }

    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (!isBlockEqual(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

export function getTitleFromBlocks(blocks: JSONContent[]): string {
    const h1 = blocks.find(v => v.type === 'heading' && v.attrs?.level === 1);
    return h1?.content?.[0]?.text || '';
}

export function setTitleAndSlugFromBlocks(blog: BlogEntity) {
    const title = getTitleFromBlocks(blog.content);
    blog.title = title;
    blog.slug = slugify(title);
    blog.image = getImageBlogPost(blog);
}

export function getImageBlogPost(post: BlogEntity): string {
    const first = post.content[1];
    if (!first || first.type !== 'image') return '';
    return first.attrs?.path || '';
}

@(entity.name('blog').index(['slug']))
export class BlogEntity {
    id: number & PrimaryKey & AutoIncrement = 0;
    createdAt: Date = new Date();
    updatedAt: Date = new Date();

    publishedAt: Date = new Date();
    published: boolean = false;

    /**
     * If the first content (after header) is an image, this blog entry
     * will be displayed as a blog image post.
     */
    image: string & DatabaseField<{ default: '' }> = '';

    slug: string = '';
    title: string = '';
    content: JSONContent[] = [];
}

// Want in angular pipe the format e.g. "15 Jul 24"
export const blogDateFormat = 'dd MMM yy';

// Not used yet, but will be used in the future when we converted markdown documentation to more dynamic content.
@(entity.name('page').index(['url']))
export class PageEntity {
    id: number & PrimaryKey & AutoIncrement = 0;
    createdAt: Date = new Date();
    updatedAt: Date = new Date();

    /**
     * Computed when parent slug or self slug changes.
     */
    url: string = '';

    slug: string = '';
    title: string = '';

    link?: '';
    content?: JSONContent[];

    description?: string;

    level: number = 0; // 0 is root, 1 is first child, etc.
    left: number = 0; // left position in tree, used for sorting
    right: number = 0; // right position in tree, used for sorting
}
