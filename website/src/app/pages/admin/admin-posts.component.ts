import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { injectAdminRpc } from '@app/app/pages/admin/admin-client.js';
import { TextEditorComponent } from '@app/app/pages/admin/text-editor.component.js';
import { injectLocalStorageNumber } from '@app/app/utils.js';
import { BlogEntity, blogDateFormat, isBlocksEqual } from '@app/common/models.js';
import { JSONContent } from '@tiptap/core';
import { createNotifier } from 'ngxtension/create-notifier';
import { derivedAsync } from 'ngxtension/derived-async';
import { linkedQueryParam } from 'ngxtension/linked-query-param';

import { formatError } from '@deepkit/core';
import {
    ButtonGroupComponent,
    ButtonGroupsComponent,
    CheckboxComponent,
    FilesystemApi,
    InputComponent,
    ListComponent,
    ListItemComponent,
    MenuComponent,
    MenuItemComponent,
    SplitterComponent,
} from '@deepkit/desktop-ui';

@Component({
    selector: 'dw-admin-posts',
    template: `
        <div class="sidebar" #sidebar>
            <dui-menu>
                <dui-menu-item label="File">
                    <dui-menu-item label="New" (click)="create()" hotkey="meta+n" />
                    <dui-menu-item label="Save" (click)="save()" hotkey="meta+s" />
                </dui-menu-item>
            </dui-menu>
            <dui-list class="overlay-scrollbar-small">
                @for (post of posts(); track post.id) {
                    <dui-list-item (click)="postId.set(post.id); view.set('edit')" [active]="postId() === post.id">
                        <span>{{ post.publishedAt | date: noteDateFormat }}</span>
                        {{ post.title || post.id }}
                    </dui-list-item>
                }
            </dui-list>
        </div>
        <dui-splitter indicator [(size)]="sidebarSize" [element]="sidebar" />
        <div class="container">
            <dui-button-groups>
                <dui-button-group>
                    @if (error(); as error) {
                        <div>(Error: {{ error }})</div>
                    }
                </dui-button-group>
                @if (post(); as post) {
                    <dui-button-group>
                        @if (changed()) {
                            <span>(changed)</span>
                        }
                        <dui-checkbox [(ngModel)]="post.published">Published</dui-checkbox>
                        <dui-input round type="date" [(ngModel)]="post.publishedAt" />
                    </dui-button-group>
                }
            </dui-button-groups>
            <app-text-editor [(ngModel)]="content" [filesystemApi]="api()" />
        </div>
    `,
    imports: [
        ListComponent,
        ListItemComponent,
        ButtonGroupComponent,
        SplitterComponent,
        ButtonGroupsComponent,
        FormsModule,
        MenuComponent,
        MenuItemComponent,
        InputComponent,
        CheckboxComponent,
        DatePipe,
        TextEditorComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: flex;
            flex-direction: row;
            flex: 1;
            background-color: #0f1217;
            overflow: hidden;
        }

        dui-button-groups {
            justify-content: end;
        }

        dui-list-item {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 6px;
        }

        dui-list-item span {
            color: var(--dui-text-light);
        }

        dui-menu {
            padding: 4px;
        }

        app-text-editor {
            flex: 1;
        }

        .normalize-text {
            padding: 40px;
            max-width: unset;
        }

        dui-splitter {
            /*background-color: var(--dui-line-color-light);*/
            /*border-radius: 3px;*/
            /*height: 150px;*/
            /*margin: auto;*/
            border-right: 1px solid var(--dui-line-color-light);
        }

        .sidebar {
            width: 320px;
            display: flex;
            flex-direction: column;

            dui-button-group {
                margin: 8px;
            }

            dui-list {
                flex: 1;
            }
        }

        .container {
            flex: 1;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow: hidden;
        }
    `,
})
export class AdminPostsComponent {
    noteDateFormat = blogDateFormat;

    api = input.required<FilesystemApi>();
    adminRpc = injectAdminRpc();
    sidebarSize = injectLocalStorageNumber('deepkit/admin/sidebar', { defaultValue: 300 });

    content = signal<JSONContent[]>([
        {
            type: 'paragraph',
            attrs: {},
            content: [
                {
                    type: 'text',
                    attrs: {},
                    text: 'Example Text',
                },
            ],
        },
    ]);
    // (injectLocalStorage('deepkit/admin/add-content', { defaultValue: [] as any[] });

    view = linkedQueryParam<'edit' | 'add'>('view', {
        defaultValue: 'edit',
    });

    reload = createNotifier();
    posts = derivedAsync(
        () => {
            this.reload.listen();
            return this.adminRpc.getPosts();
        },
        { initialValue: [] },
    );

    postId = linkedQueryParam('post', {
        parse: value => (value ? Number(value) : 0),
        stringify: value => (value ? value : undefined),
    });

    post = signal<BlogEntity | undefined>(undefined);

    remotePost = derivedAsync(() => {
        const id = this.postId();
        if (!id) return;
        return this.adminRpc.getPost(id).catch(() => undefined);
    });

    saving = signal(false);
    error = signal('');

    changed = computed(() => {
        const blocks = this.content();
        const post = this.post();
        const equal = isBlocksEqual(blocks, post?.content);
        // if (!equal) {
        //     console.log('not equal', blocks, post?.content);
        //     console.log('json', JSON.stringify(blocks, null, 2), JSON.stringify(post?.content, null, 2));
        // }
        return !equal;
    });

    constructor() {
        effect(() => {
            const post = this.post();
            this.content.set(post?.content || []);
        });
        effect(async () => {
            const postId = this.postId();
            const post = this.post();
            if (postId === 0 || post?.id === postId) return;
            const remotePost = await this.adminRpc.getPost(postId).catch(() => undefined);
            if (this.postId() === remotePost?.id) {
                this.post.set(remotePost);
            }
        });
    }

    async create() {
        this.postId.set(0);
        this.post.set(undefined);
        this.content.set([]);
    }

    async save() {
        this.saving.set(true);
        this.error.set('');
        try {
            const post = this.post();
            if (!post) {
                const newPost = await this.adminRpc.createPost(this.content());
                this.post.set(newPost);
                this.postId.set(newPost.id);
            } else {
                post.content = this.content();
                await this.adminRpc.savePost(post);
                this.post.update(v => v && { ...v });
            }
            this.reload.notify();
        } catch (error) {
            console.error('Error saving post:', error);
            this.error.set(formatError(error));
        } finally {
            this.saving.set(false);
        }
    }
}
