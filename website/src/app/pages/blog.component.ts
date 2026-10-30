import { DatePipe, ViewportScroller } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Injectable,
    computed,
    effect,
    inject,
    input,
    viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { ControllerClient } from '@app/app/client.js';
import { ContentRenderComponent } from '@app/app/components/content-render.component.js';
import { ContentTextComponent } from '@app/app/components/content-text.component.js';
import { HeaderLogoComponent, HeaderNavComponent } from '@app/app/components/header.component.js';
import { TableOfContentComponent, TableOfContentService } from '@app/app/components/table-of-content.component.js';
import { AppDescription, AppTitle } from '@app/app/components/title.js';
import { Translation } from '@app/app/components/translation.js';
import { mediaWatch } from '@app/app/utils.js';
import { type BlogEntity, Content, blogDateFormat, bodyToString, parseBody } from '@app/common/models.js';
import { JSONContent } from '@tiptap/core';
import { derivedAsync } from 'ngxtension/derived-async';
import { injectParams } from 'ngxtension/inject-params';

import { pendingTask } from '@deepkit/desktop-ui';

@Component({
    selector: '[postItem]',
    template: `
        @let post = this.postItem();

        @if (post.image) {
            <img title="{{ post.title }}" src="/media{{ post.image }}" />
        } @else {
            <div class="content">
                <div class="title">{{ post.title }}</div>
                <div class="date">{{ post.publishedAt | date: 'dd MMM yy' }}</div>
            </div>
        }
    `,
    imports: [DatePipe],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            border-radius: 8px;
            overflow: hidden;
            background: #181c23;
            height: 250px;
            text-align: left;

            &:hover {
                background: #20242b;
                text-decoration: none !important;
            }
        }

        img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .content {
            padding: 22px;
            gap: 16px;
            flex-direction: column;
            display: flex;
        }

        .title {
            color: white;
        }

        .date {
            color: rgba(227, 236, 240, 0.75);
            font-size: 13px;
        }
    `,
})
export class BlogPostItemComponent {
    postItem = input.required<BlogEntity>();
}

@Component({
    selector: 'dw-blog-post-detail',
    imports: [
        ContentRenderComponent,
        ContentTextComponent,
        DatePipe,
        AppDescription,
        AppTitle,
        TableOfContentComponent,
    ],
    template: `
        <div class="content app-content" tabindex="0" #content>
            <dui-content-text>
                @if (post(); as post) {
                    <app-title value="{{ post.title }}" />
                    <app-description [value]="bodyToString(subline())" />

                    <h1>{{ post.title }}</h1>
                    <div class="date">{{ post.publishedAt | date: blogDateFormat }}, Marc</div>
                    <app-render-content [content]="postContent()" (onRender)="onRender()" />
                }
            </dui-content-text>
        </div>
        <app-table-of-content style="--max-size: 1120px" />
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        h1 {
            margin-bottom: 4px !important;
        }

        .date {
            padding-bottom: 8px;
        }

        .content {
            flex: 1;
            border-radius: 15px;
            padding: 50px 24px;
            background: var(--color-content-text-bg);
            max-width: 830px;
            --color-header: var(--context-text-color);
            --color-text: var(--context-text-color);
            margin-bottom: 30px;
        }
    `,
})
export class BlogPostDetailComponent {
    client = inject(ControllerClient);
    slug = injectParams('slug');

    subline = computed(() => {
        const content = this.postContent();
        if (!content) return '';
        return parseBody(content).subline;
    });

    post = derivedAsync(
        pendingTask(async () => {
            const slug = this.slug();
            if (!slug) return undefined;
            return await this.client.main.getBlogPost(slug);
        }),
    );

    postContent = computed(() => {
        const post = this.post();
        if (!post) return [];
        return tiptapToContent(post.content);
    });
    protected readonly blogDateFormat = blogDateFormat;
    protected readonly bodyToString = bodyToString;

    toc = inject(TableOfContentService);
    activatedRoute = inject(ActivatedRoute);
    viewportScroller = inject(ViewportScroller);
    content = viewChild('content', { read: ElementRef<HTMLElement> });

    constructor() {
        effect(() => {
            this.toc.render(this.content()?.nativeElement);
        });
    }

    onRender() {
        this.toc.triggerUpdate();
        const fragment = this.activatedRoute.snapshot.fragment;
        if (fragment) {
            this.viewportScroller.scrollToAnchor(fragment);
        }
    }
}

@Component({
    selector: 'dw-blog-list',
    imports: [BlogPostItemComponent, RouterLink],
    template: `
        <div class="articles-line"></div>
        <div class="articles">
            @for (post of blog.posts(); track $index) {
                <a routerLink="/{{ translation.lang() }}/blog/{{ post.slug }}" [postItem]="post"></a>
            }
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            flex: 1;
            max-width: 830px;
        }

        .articles {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 18px;
            align-items: start;
        }

        .articles-line {
            background: #181c23;
            height: 6px;
            margin-bottom: 32px;
        }
    `,
})
export class BlogListComponent {
    blog = inject(BlogService);
    translation = inject(Translation);
}

@Injectable({ providedIn: 'root' })
export class BlogService {
    client = inject(ControllerClient);
    posts = derivedAsync(
        pendingTask(() => this.client.main.getBlogPosts()),
        {
            initialValue: [],
        },
    );
}

@Component({
    selector: 'dw-notes',
    imports: [AppTitle, HeaderNavComponent, HeaderLogoComponent, RouterLink, DatePipe, RouterOutlet],
    template: `
        <app-title value="Blog"></app-title>
        <div class="sidebar">
            <div class="container">
                <div class="logo-container">
                    <dw-header-logo />
                </div>
                <nav>
                    @for (post of blog.posts(); track $index) {
                        @if (!post.image) {
                            <a routerLink="/{{ translation.lang() }}/blog/{{ post.slug }}">
                                <span>{{ post.publishedAt | date: 'dd MMM yy' }}</span>
                                <span>{{ post.title }}</span>
                            </a>
                        }
                    }
                </nav>
            </div>
        </div>

        <div class="layout">
            <div class="header">
                <dw-header-nav [logo]="breakpoint()" />
            </div>

            <router-outlet />
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './blog.component.css',
})
export class BlogComponent {
    blog = inject(BlogService);
    translation = inject(Translation);
    breakpoint = mediaWatch('(max-width: 1080px)');
}

function tiptapToContent(content?: JSONContent[], level: number = 1): (Content | string)[] {
    if (!content) return [];
    const result: Content['children'] = [];
    for (const item of content) {
        if (item.type === 'paragraph') {
            result.push({ tag: 'p', children: tiptapToContent(item.content, level + 1) });
        } else if (item.type === 'heading') {
            const h = item.attrs?.level || 1;
            if (h === 1 && level === 1) continue;
            result.push({ tag: `h${h}`, children: tiptapToContent(item.content, level + 1) });
        } else if (item.type === 'image') {
            const src = 'media' + item.attrs?.path;
            const alt = item.attrs?.alt || '';
            result.push({ tag: 'img', props: { src, alt } });
        } else if (item.type === 'bulletList') {
            result.push({
                tag: 'ul',
                children:
                    item.content?.map(li => ({
                        tag: 'li',
                        children: tiptapToContent(li.content, level + 1),
                    })) || [],
            });
        } else if (item.type === 'codeBlock') {
            result.push({
                tag: 'pre',
                props: { class: 'language-' + item.attrs?.language || '' },
                children: [item.content?.map(c => c.text || '').join('') || ''],
            });
        } else if (item.type === 'text' && item.text) {
            let content: Content | string = item.text;

            const link = item.marks?.find(m => m.type === 'link');
            if (link) {
                content = {
                    tag: 'a',
                    props: link.attrs,
                    children: [content],
                };
            }
            if (item.marks?.find(v => v.type === 'code')) {
                content = {
                    tag: 'code',
                    children: [content],
                };
            }

            if (item.marks?.find(v => v.type === 'bold')) {
                content = {
                    tag: 'strong',
                    children: [content],
                };
            }

            if (item.marks?.find(v => v.type === 'italic')) {
                content = {
                    tag: 'i',
                    children: [content],
                };
            }

            if (item.marks?.find(v => v.type === 'underline')) {
                content = {
                    tag: 'u',
                    children: [content],
                };
            }

            if (item.marks?.find(v => v.type === 'strike')) {
                content = {
                    tag: 's',
                    children: [content],
                };
            }

            result.push(content);
        }
    }
    return result;
}
