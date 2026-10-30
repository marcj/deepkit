import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    Injectable,
    OnDestroy,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContentTextService } from '@app/app/components/content-text.component.js';
import { HeaderLogoComponent } from '@app/app/components/header.component.js';
import { injectAdminRpc, injectMainRpc } from '@app/app/pages/admin/admin-client.js';
import { AdminPostsComponent } from '@app/app/pages/admin/admin-posts.component.js';
import { injectLocalStorageNumber } from '@app/app/utils.js';
import type { AdminFilesController } from '@app/server/controller/admin-files.controller';
import { type DocumentType } from '@tiptap/core';
import { Subscription } from 'rxjs';

import { formatError } from '@deepkit/core';
import {
    ButtonComponent,
    ButtonGroupComponent,
    ButtonGroupsComponent,
    DuiApp,
    DuiStyleComponent,
    FileUploaderComponent,
    FilesystemComponent,
    InputComponent,
    LoadingSpinnerComponent,
    SplitterComponent,
    TabButtonComponent,
} from '@deepkit/desktop-ui';
import { RpcWebSocketClient, provideRpcWebSocketClient } from '@deepkit/rpc';

function createDefaultBlocks(): DocumentType['content'] {
    return [
        // { type: 'header', text: 'New Post' },
        // { type: 'paragraph', text: 'Write your content here...' },
    ];
}

@Component({
    selector: 'dw-admin-login',
    template: `
        <dw-header-logo />
        @if (!clientUser.connected()) {
            <div>Connecting ...</div>
        } @else {
            <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
                <dui-input placeholder="Email" name="email" formControlName="email" (enter)="onSubmit()" />
                <dui-input
                    placeholder="Password"
                    name="password"
                    type="password"
                    formControlName="password"
                    (enter)="onSubmit()"
                />
                @if (error()) {
                    <div style="color: var(--dui-color-red)">{{ error() }}</div>
                }
                <dui-button textured [disabled]="sending()">Login</dui-button>
            </form>
        }
    `,
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            gap: 24px;
        }

        dw-header-logo {
            flex: 0;
        }

        form {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [InputComponent, ReactiveFormsModule, ButtonComponent, HeaderLogoComponent],
})
class AdminLoginComponent {
    mainRpc = injectMainRpc();
    client = inject(RpcWebSocketClient);
    clientUser = inject(ClientUser);
    loginForm = new FormGroup({
        email: new FormControl('', [Validators.required, Validators.email]),
        password: new FormControl('', [Validators.required]),
    });

    sending = signal(false);
    error = signal('');

    async onSubmit() {
        if (!this.loginForm.valid) return;
        const { email, password } = this.loginForm.value;
        if (!email || !password) return;
        this.sending.set(true);
        this.error.set('');
        try {
            const token = await this.mainRpc.login(email, password);
            localStorage.setItem('token', token);
            this.client.token.set(token);
            await this.client.disconnect();
            await this.client.connect();
        } catch (error) {
            this.error.set(formatError(error));
        } finally {
            this.sending.set(false);
        }
    }
}

@Injectable()
export class ClientUser implements OnDestroy {
    client = inject(RpcWebSocketClient);
    adminRpc = injectAdminRpc();

    connected = toSignal(this.client.transporter.connection);
    loading = signal(true);
    user = signal<{ email: string } | undefined>(undefined);

    protected sub: Subscription;

    constructor() {
        this.client.token.set(localStorage.getItem('token'));
        this.sub = this.client.transporter.connection.subscribe(connected => {
            this.loading.set(false);
            if (!connected) return;
            if (!this.client.token.get()) {
                this.user.set(undefined);
                return;
            }
            this.loading.set(true);
            this.adminRpc
                .getUser()
                .then(user => {
                    this.user.set(user);
                })
                .finally(() => {
                    this.loading.set(false);
                });
        });
        setTimeout(() => {
            this.client.connect().catch(error => {
                this.loading.set(false);
                this.user.set(undefined);
            });
        }, 10);
    }

    ngOnDestroy() {
        this.sub.unsubscribe();
    }
}

@Component({
    selector: 'dw-admin',
    template: `
        <dui-style normalize-style />
        @if (clientUser.user(); as user) {
            <dui-button-groups>
                <dui-button-group>
                    <dui-tab-button [active]="true">Posts</dui-tab-button>
                    <dui-tab-button [active]="files()" (click)="toggleFiles()">Files</dui-tab-button>
                </dui-button-group>
                <dw-header-logo />
                <dui-button-group>
                    <dui-filesystem-uploader />
                    <dui-button small>Logout</dui-button>
                </dui-button-group>
            </dui-button-groups>
            <div class="frame">
                <dw-admin-posts [api]="filesApi" />
                @if (files()) {
                    <dui-splitter
                        horizontal
                        inverted
                        [(size)]="filesSize"
                        [element]="$safeNavigationMigration(fileSystemElement()?.nativeElement)"
                    />
                    <dui-filesystem [api]="filesApi" />
                }
            </div>
        } @else {
            @if (clientUser.loading()) {
                <dui-loading-spinner />
            } @else {
                <dw-admin-login />
            }
        }
    `,
    imports: [
        DuiStyleComponent,
        AdminLoginComponent,
        ButtonGroupsComponent,
        TabButtonComponent,
        ButtonGroupComponent,
        ButtonComponent,
        HeaderLogoComponent,
        LoadingSpinnerComponent,
        FileUploaderComponent,
        AdminPostsComponent,
        SplitterComponent,
        FilesystemComponent,
    ],
    host: {
        '[class.dui-normalized]': 'true',
    },
    styleUrls: ['./admin.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [ClientUser, provideRpcWebSocketClient(undefined, { 4200: 8080 })],
})
export class AdminComponent {
    client = inject(RpcWebSocketClient);
    clientUser = inject(ClientUser);
    filesSize = injectLocalStorageNumber('deepkit/admin/files-size', { defaultValue: 300 });
    filesApi = this.client.controller<AdminFilesController>('admin/files');
    files = signal(false);

    fileSystemElement = viewChild(FilesystemComponent, { read: ElementRef });

    toggleFiles() {
        this.files.update(v => !v);
    }

    constructor(duiApp: DuiApp, contentTextService: ContentTextService) {
        duiApp.disableThemeDetection();
        duiApp.setDarkMode(true);
        contentTextService.disableDarkModeSetting.set(true);
    }
}
