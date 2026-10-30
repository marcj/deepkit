import { AsyncPipe, DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Injectable,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    QueryList,
    SimpleChanges,
    ViewChild,
    ViewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { asyncOperation } from '@deepkit/core';
import {
    ButtonComponent,
    ButtonGroupComponent,
    ButtonGroupsComponent,
    ContextDropdownDirective,
    DropdownComponent,
    DropdownItemComponent,
    DropdownSplitterComponent,
    DuiDialog,
    FileDropDirective,
    FilePickerDirective,
    FilePickerItem,
    HumanFileSizePipe,
    IconComponent,
    IndicatorComponent,
    InputComponent,
    ObjectURLPipe,
    OpenDropdownDirective,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
} from '@deepkit/desktop-ui';
import { EventDispatcher } from '@deepkit/event';
import { MediaFile } from '@deepkit/framework-debug-api';
import { ClientProgress, Progress } from '@deepkit/rpc';
import { LoadingSpinnerComponent } from '@deepkit/ui-library';

import { ControllerClient } from '../../client';
import { State, fileAddedEvent, fileQueuedEvent, fileUploadedEvent } from '../../state';
import { Lifecycle, trackByIndex } from '../../utils';

function imageSize(data: Uint8Array): Promise<{ width: number; height: number } | undefined> {
    const blob = new Blob([data as BlobPart]);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.onload = function () {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = function () {
            resolve(undefined);
        };
    });
}

function isImage(file: MediaFile): boolean {
    //determine based on mimeType if it's an image
    return !!file.mimeType && file.mimeType.startsWith('image/');
}

function mimeTypeToLabel(mimeType?: string) {
    if (!mimeType) return 'Unknown';

    const map: { [name: string]: string } = {
        'application/octet-stream': 'Binary',
        'application/json': 'JSON',
        'application/xml': 'XML',
        'application/xhtml+xml': 'XHTML',
        'application/javascript': 'JavaScript',
        'application/typescript': 'TypeScript',

        'application/pdf': 'PDF',
        'application/zip': 'ZIP',
        'application/x-rar-compressed': 'RAR',
        'application/x-7z-compressed': '7Z',
        'application/x-tar': 'TAR',
        'application/x-gzip': 'GZIP',
        'application/x-bzip2': 'BZIP2',
        'application/x-bzip': 'BZIP',
        'application/x-lzma': 'LZMA',
        'application/x-xz': 'XZ',
        'application/x-compress': 'COMPRESS',
        'application/x-apple-diskimage': 'DMG',
        'application/x-msdownload': 'EXE',
        'application/x-ms-dos-executable': 'EXE',
        'application/x-msi': 'MSI',
        'application/x-ms-shortcut': 'LNK',
        'application/x-shockwave-flash': 'SWF',
        'application/x-sqlite3': 'SQLITE',
        'application/x-iso9660-image': 'ISO',
        'application/x-ms-wim': 'WIM',
        'application/x-ms-xbap': 'XAP',

        'video/x-msvideo': 'AVI',
        'video/x-ms-wmv': 'WMV',
        'video/x-ms-asf': 'ASF',

        'video/mp4': 'MP4',
        'video/mpeg': 'MPEG',
        'video/quicktime': 'MOV',
        'audio/x-wav': 'WAV',
        'audio/x-aiff': 'AIFF',
        'audio/x-m4a': 'M4A',
        'audio/x-ms-wma': 'WMA',
        'audio/x-ms-wax': 'WAX',
        'audio/x-ms-wpl': 'WPL',
        'audio/x-mpegurl': 'M3U',
        'audio/x-scpls': 'PLS',
        'audio/x-flac': 'FLAC',
        'audio/x-ogg': 'OGG',
        'audio/x-matroska': 'MKV',

        'image/jpeg': 'JPEG',
        'image/png': 'PNG',
        'image/gif': 'GIF',
        'image/bmp': 'BMP',
        'image/tiff': 'TIFF',

        'text/plain': 'TXT',
        'text/html': 'HTML',
        'text/javascript': 'JS',
        'text/json': 'JSON',

        'text/css': 'CSS',
        'text/csv': 'CSV',
        'text/calendar': 'ICS',
        'text/xml': 'XML',
    };
    return map[mimeType] || (mimeType.split('/')[1] || 'Unknown').toUpperCase();
}

@Injectable({ providedIn: 'root' })
export class MediaFileCache {
    file: { [id: string]: { file: MediaFile; data: Uint8Array; loaded: Date } | false } = {};
    loadingState: { [id: string]: Promise<{ file: MediaFile; data: Uint8Array } | false> } = {};

    //5 minutes
    maxAge = 5 * 60 * 1000;

    constructor(protected client: ControllerClient) {
        setInterval(() => {
            this.clean();
        }, 30_000);
    }

    clean() {
        //remove files older than maxAge
        const now = new Date();
        for (const id in this.file) {
            const file = this.file[id];
            if (file && now.getTime() - file.loaded.getTime() > this.maxAge) {
                delete this.file[id];
                delete this.loadingState[id];
            }
        }
    }

    isLoading(id: string) {
        return this.file[id] === undefined;
    }

    getPreview(id: string) {
        return this.file[id];
    }

    load(filesystem: number, id?: string): Promise<{ file: MediaFile; data: Uint8Array } | false> {
        if (!id) return Promise.resolve(false);
        if (this.loadingState[id] !== undefined) return this.loadingState[id];

        return (this.loadingState[id] = asyncOperation(async resolve => {
            try {
                const preview = await this.getData(filesystem, id);
                this.file[id] = preview ? { ...preview, loaded: new Date() } : preview;
                resolve(preview);
            } catch (error: any) {
                console.log('error', error);
                resolve(false);
            }
        }));
    }

    async getData(fs: number, id: string): Promise<{ file: MediaFile; data: Uint8Array } | false> {
        throw new Error('Not implemented');
    }
}

@Injectable({ providedIn: 'root' })
export class MediaFileQuickLookCache extends MediaFileCache {
    async getData(fs: number, id: string) {
        return await this.client.media.getMediaQuickLook(fs, id);
    }
}

@Component({
    selector: 'app-media-detail',
    styleUrls: ['./media-detail.component.scss'],
    template: `
        <div class="loading" [class.visible]="data === undefined">
            @if (progress && progress.download | async; as download) {
                <dui-indicator [step]="download.progress"></dui-indicator>
            }
        </div>
        @if (data) {
            @switch (type) {
                @case ('image') {
                    <div class="image overlay-scrollbar-small" [class.fit]="true">
                        @if (data) {
                            <img [src]="data | objectURL: file.mimeType" alt="Image" />
                        }
                    </div>
                }
                <!--            <div class="pdf" *ngSwitchCase="'pdf'">-->
                <!--                <iframe [src]="data|objectURL:'application/pdf'" frameborder="0" height="100%" width="100%">-->
                <!--                </iframe>-->
                <!--            </div>-->
                @default {
                    <div class="default">
                        <iframe [src]="data | objectURL: file.mimeType" frameborder="0" height="100%" width="100%">
                        </iframe>
                    </div>
                }
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ObjectURLPipe, AsyncPipe, IndicatorComponent],
})
export class MediaFileDetail implements OnChanges, OnInit {
    @Input() file!: { filesystem: number; id: string; mimeType?: string };
    @Input() data?: Uint8Array | false;

    progress?: Progress;

    get type(): string {
        if (!this.file.mimeType) return 'unknown';

        if (this.file.mimeType.startsWith('image/')) return 'image';
        if (this.file.mimeType.startsWith('video/')) return 'video';
        if (this.file.mimeType.startsWith('audio/')) return 'audio';
        if (this.file.mimeType.startsWith('application/pdf')) return 'pdf';

        //all text types like txt, html, etc
        if (this.file.mimeType.startsWith('text/')) return 'text';
        if (this.file.mimeType.startsWith('application/json')) return 'text';
        if (this.file.mimeType.startsWith('application/xml')) return 'text';
        if (this.file.mimeType.startsWith('application/javascript')) return 'text';

        return 'unknown';
    }

    constructor(private client: ControllerClient) {}

    async ngOnInit() {
        await this.load();
    }

    async ngOnChanges() {
        await this.load();
    }

    async load() {
        this.progress = ClientProgress.track();
        this.data = await this.client.media.getMediaData(this.file.filesystem, this.file.id);
    }

    download() {
        window.open(`/api/shop/media/${this.file.id}/download`);
    }
}

@Component({
    selector: 'app-media-file-thumbnail',
    styleUrls: ['./media-file-thumbnail.component.scss'],
    template: `
        @if (file.type === 'directory') {
            <img
                (contextmenu)="onContextMenu()"
                (click)="selectFile($event)"
                alt="Folder icon"
                src="assets/images/icons/folder-icon-dark.png"
            />
        }
        @if (file.type !== 'directory' && url) {
            <img
                [src]="url"
                (load)="loaded()"
                (error)="loaded(true)"
                [class.image-hidden]="loading || noPreview"
                loading="lazy"
                (contextmenu)="onContextMenu()"
                (click)="selectFile($event)"
                alt="File preview"
            />
        }
        @if (file.type !== 'directory' && noPreview) {
            <img
                class="no-preview"
                (contextmenu)="onContextMenu()"
                (click)="selectFile($event)"
                src="assets/images/icons/file-icon-unknown.png"
            />
        }
        @if (loading && file.type !== 'directory') {
            <app-loading-spinner (contextmenu)="onContextMenu()" (click)="selectFile($event)"></app-loading-spinner>
        }
        @if (withTitle) {
            <div class="title">
                @if (rename && view === 'icons') {
                    <textarea
                        #input
                        type="text"
                        [(ngModel)]="newName"
                        [ngModelOptions]="{ standalone: true }"
                        (blur)="doRename(undefined)"
                        (keydown.escape)="doRename(undefined)"
                        (keydown.enter)="doRename(newName)"
                    ></textarea>
                }
                @if (rename && view === 'list') {
                    <input
                        #input
                        type="text"
                        [(ngModel)]="newName"
                        [ngModelOptions]="{ standalone: true }"
                        (blur)="doRename(undefined)"
                        (keydown.escape)="doRename(undefined)"
                        (keydown.enter)="doRename(newName)"
                    />
                }
                @if (!rename) {
                    <span (contextmenu)="onContextMenu()" (click)="selectFile($event)">{{
                        truncateFileName(file.name)
                    }}</span>
                }
            </div>
        }
    `,
    host: {
        '[class.selected]': 'selected',
        '[class.list]': `view === 'list'`,
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [LoadingSpinnerComponent, FormsModule],
})
export class MediaFileThumbnail implements OnInit, OnDestroy, OnChanges {
    loadedUrl = '';
    loading = true;
    noPreview = false;

    newName = '';

    @Input() view: 'icons' | 'list' = 'icons';

    @Input() file!: MediaFile;
    @Output() fileChange = new EventEmitter<MediaFile>();
    @Input() withTitle: boolean = true;
    @Input() selected: boolean = false;
    @Input() rename: boolean = false;
    @Output() renamed = new EventEmitter<string | undefined>();

    @ViewChild('input') set inputRef(ref: ElementRef) {
        if (!!ref) {
            setTimeout(() => {
                ref.nativeElement.focus();
                ref.nativeElement.setSelectionRange(0, this.newName.lastIndexOf('.') || this.newName.length);
            });
        }
    }

    constructor(
        private client: ControllerClient,
        public elementRef: ElementRef,
        private cd: ChangeDetectorRef,
    ) {}

    loaded(error: boolean = false) {
        this.loading = false;
        this.noPreview = error;
        this.cd.detectChanges();
    }

    doRename(name: string | undefined) {
        this.renamed.emit(name);
        this.newName = this.file.name;
    }

    onContextMenu() {
        if (!this.selected) {
            this.fileChange.next(this.file);
        }
    }

    selectFile($event: MouseEvent) {
        this.fileChange.next(this.file);
        $event.stopPropagation();
        $event.preventDefault();
    }

    ngOnInit() {
        this.newName = this.file.name;
        // this.loadPreview();
    }

    get url() {
        if (!this.file.mimeType.startsWith('image/')) return '';

        return this.client.getUrl(
            '/_debug/api/media/' + this.file.filesystem + '/preview?path=' + encodeURIComponent(this.file.path),
        );
    }

    ngOnDestroy() {}

    ngOnChanges(changes: SimpleChanges) {
        this.newName = this.file.name;

        this.loading = false;
        this.noPreview = true;

        if (this.url) {
            this.noPreview = false;
            if (this.loadedUrl !== this.url) {
                this.loading = true;
                this.loadedUrl = this.url;
            }
        }
    }

    // @observeAction
    // async loadPreview() {
    //     await this.mediaFileCache.load(this.file.id);
    // }

    truncateFileName(name: string) {
        if (this.view === 'list') return name;
        //if file name is too long, cut it in the middle and add ...
        const maxLength = 25;
        if (name.length > maxLength) {
            return name.substr(0, maxLength / 2) + '...' + name.substr(name.length - maxLength / 2, name.length);
        }
        return name;
    }
}

@Component({
    selector: 'app-media-file-quick-look',
    styleUrls: ['./media-file-quick-look.component.scss'],
    template: `
        <dui-button-groups>
            <dui-button-group>
                <dui-icon name="clear" (click)="close.next()" clickable></dui-icon>
                @if (files.length > 1) {
                    <dui-icon name="arrow_left" (click)="prev()" clickable></dui-icon>
                }
                @if (files.length > 1) {
                    <dui-icon name="arrow_right" (click)="next()" clickable></dui-icon>
                }
                @if (file) {
                    <div>
                        {{ file.name }}
                    </div>
                }
            </dui-button-group>
            <dui-button-group float="right">
                <dui-icon name="share" clickable></dui-icon>
            </dui-button-group>
        </dui-button-groups>
        <div class="overlay-scrollbar-small quick-look-content">
            @if (file) {
                @if (file.type === 'directory') {
                    <img alt="Folder icon" src="assets/images/icons/folder-icon-dark.png" />
                }
                @if (file.type !== 'directory' && mediaFileCache.getPreview(file.id); as preview) {
                    <img [src]="preview.data | objectURL: file.mimeType" alt="File preview" />
                }
                @if (file.type !== 'directory' && mediaFileCache.getPreview(file.id) === false) {
                    <img class="no-preview" src="assets/images/icons/file-icon-unknown.png" />
                }
                @if (file.type !== 'directory' && mediaFileCache.isLoading(file.id)) {
                    <app-loading-spinner></app-loading-spinner>
                }
            }
        </div>
        @if (file) {
            <div class="stats text-selection">
                <div class="stat">
                    <div class="label">Size</div>
                    <div class="value">
                        <div>{{ file.size | fileSize }}</div>
                        @if (dim) {
                            <div>{{ dim.width }}x{{ dim.height }}</div>
                        }
                    </div>
                </div>
                <div class="stat">
                    <div class="label">Type</div>
                    <div class="value">{{ mimeTypeToLabel(file.mimeType) }}</div>
                </div>
                <!--            <div class="stat">-->
                <!--                <div class="label">Created</div>-->
                <!--                <div class="value">{{file.created | date:'medium'}}</div>-->
                <!--            </div>-->
                <div class="stat">
                    <div class="label">Modified</div>
                    <div class="value">{{ file.lastModified | date: 'medium' }}</div>
                </div>
            </div>
        }
    `,
    host: {
        '[attr.tabindex]': '0',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        ButtonGroupsComponent,
        ButtonGroupComponent,
        IconComponent,
        ObjectURLPipe,
        DatePipe,
        LoadingSpinnerComponent,
        HumanFileSizePipe,
    ],
})
export class MediaQuickLook implements OnInit, OnDestroy, OnChanges {
    mimeTypeToLabel = mimeTypeToLabel;
    isImage = isImage;
    imageSize = imageSize;

    @Input() files!: MediaFile[];

    @Output() close = new EventEmitter<void>();

    dim?: { width: number; height: number };

    file?: MediaFile;

    constructor(
        public mediaFileCache: MediaFileQuickLookCache,
        private client: ControllerClient,
        private cd: ChangeDetectorRef,
    ) {}

    next() {
        const index = this.files.indexOf(this.file!);
        if (index < this.files.length - 1) {
            this.select(this.files[index + 1]);
        } else {
            this.select(this.files[0]);
        }
    }

    prev() {
        const index = this.files.indexOf(this.file!);
        if (index > 0) {
            this.select(this.files[index - 1]);
        } else {
            this.select(this.files[this.files.length - 1]);
        }
    }

    @HostListener('keydown', ['$event'])
    onClose($event: KeyboardEvent) {
        if ($event.key === 'Escape' || $event.key === ' ') {
            $event.stopPropagation();
            this.close.next();
        }
    }

    ngOnDestroy() {}

    ngOnChanges(changes: SimpleChanges) {
        this.load();
    }

    ngOnInit() {
        this.load();
    }

    load() {
        if (this.file && !this.files.includes(this.file)) {
            this.file = undefined;
        }

        if (!this.file) {
            this.select(this.files[0]);
        }
    }

    async select(file: MediaFile) {
        if (this.file === file) return;
        this.file = file;

        const preview = await this.mediaFileCache.load(file.filesystem, file.id);
        if (preview && isImage(file)) {
            this.dim = await imageSize(preview.data);
        }
        this.cd.detectChanges();
    }
}

function sortByName(a: MediaFile, b: MediaFile) {
    return a.name.localeCompare(b.name);
}

function sortByCreated(a: MediaFile, b: MediaFile) {
    const at = a.created?.getTime() || 0;
    const bt = b.created?.getTime() || 0;
    return at - bt;
}

function sortByModified(a: MediaFile, b: MediaFile) {
    const at = a.lastModified?.getTime() || 0;
    const bt = b.lastModified?.getTime() || 0;
    return at - bt;
}

function sortByMimeType(a: MediaFile, b: MediaFile) {
    return (a.mimeType || '').localeCompare(b.mimeType || '');
}

function sortBySize(a: MediaFile, b: MediaFile) {
    return a.size - b.size;
}

// folder first
function sortByType(a: MediaFile, b: MediaFile) {
    return a.type === 'directory' ? -1 : 1;
}

@Component({
    selector: 'app-media',
    styleUrls: ['./media.component.scss'],
    template: `
        <!--        <menu-breadcrumb>Media</menu-breadcrumb>-->
        <!--        <menu-breadcrumb *ngIf="media">{{media.path}}</menu-breadcrumb>-->

        <dui-dropdown #newDropdown>
            <dui-dropdown-item (click)="createFolder()">Folder</dui-dropdown-item>
            <dui-dropdown-item duiFilePicker (duiFilePickerChange)="upload($event)">Upload</dui-dropdown-item>
        </dui-dropdown>

        <dui-dropdown #sortDropdown>
            <dui-dropdown-item [selected]="sort.by === 'name'" (click)="sortBy('name')">Name</dui-dropdown-item>
            <dui-dropdown-item [selected]="sort.by === 'created'" (click)="sortBy('created')"
                >Created</dui-dropdown-item
            >
            <dui-dropdown-item [selected]="sort.by === 'modified'" (click)="sortBy('modified')"
                >Modified</dui-dropdown-item
            >
            <dui-dropdown-item [selected]="sort.by === 'type'" (click)="sortBy('type')">Type</dui-dropdown-item>
            <dui-dropdown-item [selected]="sort.by === 'size'" (click)="sortBy('size')">Size</dui-dropdown-item>
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item [selected]="sort.direction === 'asc'" (click)="sortDirection('asc')"
                >Ascending</dui-dropdown-item
            >
            <dui-dropdown-item [selected]="sort.direction === 'desc'" (click)="sortDirection('desc')"
                >Descending</dui-dropdown-item
            >
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item [selected]="sort.folderFirst" (click)="toggleFolderFirst()"
                >Folder first</dui-dropdown-item
            >
        </dui-dropdown>

        <dui-dropdown #viewDropdown>
            <dui-dropdown-item [selected]="state.media.view === 'icons'" (click)="state.media.view = 'icons'"
                >Icons</dui-dropdown-item
            >
            <dui-dropdown-item [selected]="state.media.view === 'list'" (click)="state.media.view = 'list'"
                >List</dui-dropdown-item
            >
        </dui-dropdown>

        <dui-button-groups>
            <dui-button-group padding="none">
                <dui-button [openDropdown]="newDropdown">New</dui-button>
                <dui-button [openDropdown]="sortDropdown">Sort</dui-button>
                <dui-button [openDropdown]="viewDropdown">View</dui-button>
            </dui-button-group>
            <!--            <dui-button-group>-->
            <!--                <dui-button (click)="open('/trash')" [active]="path === '/trash' || path.startsWith('/trash/')">Trash</dui-button>-->
            <!--            </dui-button-group>-->
        </dui-button-groups>

        <dui-button-groups>
            <dui-button-group padding="none" style="flex: 1">
                <!--                <dui-button textured tight icon="arrow_left"></dui-button>-->
                <!--                <dui-button textured tight icon="arrow_right"></dui-button>-->
                <dui-button textured tight icon="arrow_up" (click)="goUp()"></dui-button>
                <dui-button textured tight icon="reload" (click)="load()"></dui-button>
                <dui-input style="flex: 1;" round textured [(ngModel)]="path" (enter)="load()"></dui-input>
            </dui-button-group>
            <dui-button-group>
                <dui-input icon="search" round placeholder="Search ..." textured></dui-input>
            </dui-button-group>
        </dui-button-groups>

        <dui-dropdown #contextMenu>
            <dui-dropdown-item [disabled]="!selected.length" (click)="open(getSelectedFiles()[0]!.path)"
                >Open</dui-dropdown-item
            >
            <dui-dropdown-item [disabled]="!selected.length" (click)="openPublic(getSelectedFiles()[0]!.path)"
                >Open Public URL</dui-dropdown-item
            >
            <dui-dropdown-item [disabled]="!selected.length" (click)="openPrivate(getSelectedFiles()[0]!.path)"
                >Open Private URL</dui-dropdown-item
            >
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item [disabled]="!selected.length" (click)="deleteSelected()">Delete</dui-dropdown-item>
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item [disabled]="!selected.length" (click)="renameFile = selected[0]"
                >Rename</dui-dropdown-item
            >
            <!--            <dui-dropdown-item [disabled]="!selected.length">Duplicate</dui-dropdown-item>-->
            <dui-dropdown-item [disabled]="!selected.length" (click)="openQuickLook()">Quick Look</dui-dropdown-item>
            <!--            <dui-dropdown-splitter></dui-dropdown-splitter>-->
            <!--            <dui-dropdown-item [disabled]="!selected.length">Copy</dui-dropdown-item>-->
            <!--            <dui-dropdown-item [disabled]="!selected.length">Download</dui-dropdown-item>-->
            <!--            <dui-dropdown-item [disabled]="!selected.length">Share</dui-dropdown-item>-->
        </dui-dropdown>

        <dui-dropdown #quickLook [keepOpen]="true">
            @if (getSelectedFiles(); as files) {
                @if (files.length) {
                    <app-media-file-quick-look (close)="closeQuickLook()" [files]="files"></app-media-file-quick-look>
                }
            }
        </dui-dropdown>

        <div
            class="content"
            [class.list]="state.media.view === 'list'"
            [class.file]="media && media.type === 'file'"
            [class.overlay-scrollbar-small]="media && media.type === 'directory'"
            [class.folder]="media && media.type === 'directory'"
            (click)="selectBackground($event)"
            duiFileDrop
            duiFileDropMultiple
            (duiFileDropChange)="upload($event)"
            [contextDropdown]="contextMenu"
        >
            @if (media === false) {
                <div class="error">
                    <dui-icon name="error" />
                    <div class="message">Path {{ path }} not found</div>
                </div>
            }
            @if (media) {
                @if (media.type === 'file') {
                    <app-media-detail [file]="media"></app-media-detail>
                }
                @if (media.type === 'directory') {
                    @if (state.media.view === 'list') {
                        <dui-table selectable (selectedChange)="tableSelect($event)" [items]="files" no-focus-outline>
                            <dui-table-column name="name">
                                <ng-container *duiTableCell="let item">
                                    <app-media-file-thumbnail
                                        [file]="item"
                                        [view]="state.media.view"
                                        (fileChange)="select(item)"
                                        (renamed)="fileRenamed($event)"
                                        [rename]="item.id === renameFile"
                                        [selected]="selected.includes(item.id)"
                                    ></app-media-file-thumbnail>
                                </ng-container>
                            </dui-table-column>
                            <dui-table-column name="modified">
                                <ng-container *duiTableCell="let item">
                                    {{ item.modified | date: 'medium' }}
                                </ng-container>
                            </dui-table-column>
                            <dui-table-column name="size">
                                <ng-container *duiTableCell="let item">
                                    {{ item.size | fileSize }}
                                </ng-container>
                            </dui-table-column>
                            <dui-table-column name="Kind">
                                <ng-container *duiTableCell="let item">
                                    {{ item.type === 'directory' ? 'Folder' : mimeTypeToLabel(item.mimeType) }}
                                </ng-container>
                            </dui-table-column>
                            <!--                        <dui-table-column name="created">-->
                            <!--                            <ng-container *duiTableCell="let item">-->
                            <!--                                {{item.created | date:'medium'}}-->
                            <!--                            </ng-container>-->
                            <!--                        </dui-table-column>-->
                        </dui-table>
                    }
                    @if (state.media.view === 'icons') {
                        @for (file of files; track $index) {
                            <app-media-file-thumbnail
                                [file]="file"
                                (fileChange)="select(file)"
                                (renamed)="fileRenamed($event)"
                                [rename]="file.id === renameFile"
                                [selected]="selected.includes(file.id)"
                            />
                        }
                    }
                }
            }
        </div>
    `,
    host: {
        '[attr.tabindex]': '0',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DropdownComponent,
        DropdownItemComponent,
        FilePickerDirective,
        DropdownSplitterComponent,
        ButtonGroupsComponent,
        ButtonGroupComponent,
        ButtonComponent,
        OpenDropdownDirective,
        InputComponent,
        FormsModule,
        MediaQuickLook,
        FileDropDirective,
        ContextDropdownDirective,
        IconComponent,
        MediaFileDetail,
        TableComponent,
        TableColumnDirective,
        TableCellDirective,
        HumanFileSizePipe,
        MediaFileThumbnail,
        DatePipe,
    ],
})
export class MediaComponent implements OnInit, OnDestroy {
    trackByIndex = trackByIndex;
    mimeTypeToLabel = mimeTypeToLabel;

    @Input() filesystem: number = 0;

    path: string = '/';

    media?: MediaFile | false;
    files: MediaFile[] = [];

    sort = { by: 'name', direction: 'asc', folderFirst: true };

    @Input() dialogMode: boolean = false;
    @Input() selectMultiple: boolean = false;

    @Output() filesSelected = new EventEmitter<MediaFile[]>();
    @Output() activeFile = new EventEmitter<MediaFile>();

    @ViewChild('quickLook', { read: DropdownComponent }) quickLook?: DropdownComponent;

    @ViewChildren(MediaFileThumbnail, { read: MediaFileThumbnail }) thumbnails?: QueryList<MediaFileThumbnail>;

    selected: string[] = [];
    renameFile?: string;

    loading = false;

    lifecycle = new Lifecycle();

    constructor(
        private element: ElementRef,
        private client: ControllerClient,
        private dialog: DuiDialog,
        public state: State,
        public router: Router,
        public activatedRoute: ActivatedRoute,
        public events: EventDispatcher,
        public cd: ChangeDetectorRef,
    ) {
        this.lifecycle.add(this.events.listen(fileAddedEvent, () => this.load()));
        this.lifecycle.add(this.events.listen(fileUploadedEvent, () => this.load()));
        activatedRoute.queryParams.subscribe(params => {
            if (params.path) {
                this.path = params.path;
                this.load();
            }
        });
    }

    tableSelect(selected: MediaFile[]) {
        this.selected = selected.map(v => v.path);
    }

    getSelectedFiles(): MediaFile[] {
        return this.files.filter(file => this.selected.includes(file.id));
    }

    sortBy(by: string) {
        this.sort.by = by;
        this.sortFiles();
    }

    sortDirection(direction: 'asc' | 'desc') {
        this.sort.direction = direction;
        this.sortFiles();
    }

    toggleFolderFirst() {
        this.sort.folderFirst = !this.sort.folderFirst;
        this.sortFiles();
    }

    async fileRenamed(newName?: string) {
        if (!this.renameFile) return;
        try {
            if (!newName) return;
            await this.client.media.renameFile(this.filesystem, this.renameFile, newName);
        } finally {
            this.renameFile = undefined;
            this.element.nativeElement.focus();
        }
        await this.loadActiveFolder();
    }

    sortFiles() {
        if (this.sort.by === 'name') {
            this.files.sort(sortByName);
        } else if (this.sort.by === 'size') {
            this.files.sort(sortBySize);
        } else if (this.sort.by === 'created') {
            this.files.sort(sortByCreated);
        } else if (this.sort.by === 'modified') {
            this.files.sort(sortByModified);
        } else if (this.sort.by === 'type') {
            this.files.sort(sortByMimeType);
        }

        if (this.sort.direction === 'desc') {
            this.files.reverse();
        }

        if (this.sort.folderFirst) {
            this.files.sort(sortByType);
        }
    }

    @HostListener('keydown', ['$event'])
    keyDown(event: KeyboardEvent) {
        if (this.renameFile) return;

        if (event.key === 'Enter') {
            this.renameFile = this.selected[0];
        }

        if (event.key === 'Delete') {
            this.deleteSelected();
        } else if (event.key === ' ') {
            if (!this.quickLook) return;
            if (this.quickLook.isOpen()) {
                this.quickLook.close();
            } else {
                this.openQuickLook();
            }
        }

        if (this.thumbnails) {
            const thumbnails = this.thumbnails.toArray().map(v => ({ element: v.elementRef, file: v.file }));
            const selected = thumbnails.find(t => t.file.id === this.selected[this.selected.length - 1]);
            if (!selected) {
                //special handling
                return;
            }
            const selectedRect = selected?.element.nativeElement.getBoundingClientRect();
            let index = thumbnails.findIndex(t => t.file.id === this.selected[this.selected.length - 1]);

            if (event.key === 'ArrowLeft') {
                while (index-- > 0) {
                    const thumbnailRect = thumbnails[index].element.nativeElement.getBoundingClientRect();
                    if (thumbnailRect.top !== selectedRect.top) break;
                    if (thumbnailRect.left < selectedRect.left) {
                        this.select(thumbnails[index].file);
                        return;
                    }
                }
                if (index > 0) {
                    this.select(thumbnails[index].file);
                }
            } else if (event.key === 'ArrowRight') {
                while (index++ < thumbnails.length - 1) {
                    const thumbnailRect = thumbnails[index].element.nativeElement.getBoundingClientRect();
                    if (thumbnailRect.top !== selectedRect.top) break;
                    if (thumbnailRect.left > selectedRect.left) {
                        this.select(thumbnails[index].file);
                        return;
                    }
                }
                if (index < thumbnails.length - 1) {
                    this.select(thumbnails[index].file);
                }
            } else if (event.key === 'ArrowDown') {
                while (index++ < thumbnails.length - 1) {
                    const thumbnailRect = thumbnails[index].element.nativeElement.getBoundingClientRect();
                    if (thumbnailRect.left !== selectedRect.left) continue;
                    if (thumbnailRect.top > selectedRect.top) {
                        this.select(thumbnails[index].file);
                        return;
                    }
                }
                this.select(thumbnails[thumbnails.length - 1].file);
            } else if (event.key === 'ArrowUp') {
                while (index-- > 0) {
                    const thumbnailRect = thumbnails[index].element.nativeElement.getBoundingClientRect();
                    if (thumbnailRect.left !== selectedRect.left) continue;
                    if (thumbnailRect.top < selectedRect.top) {
                        this.select(thumbnails[index].file);
                        return;
                    }
                }
                this.select(thumbnails[0].file);
            }
        }
    }

    openQuickLook() {
        if (!this.quickLook) return;
        if (!this.selected.length) return;
        const selected = this.getSelectedFileElementForQuickLook();
        this.quickLook.open('center', selected);
    }

    @HostListener('dblclick')
    onOpen() {
        if (!this.selected.length || this.renameFile) return;
        const files = this.getSelectedFiles();
        if (!files.length) return;
        this.open(files[0].path, true);
    }

    openPrivate(path: string) {
        open(
            this.client.getUrl('/_debug/api/media/' + this.filesystem + '?path=' + encodeURIComponent(path)),
            '_blank',
        );
    }

    async openPublic(path: string) {
        const url = await this.client.media.getPublicUrl(this.filesystem, path);
        open(url, '_blank');
    }

    open(path: string, andSelect = false) {
        //in dialog mode we just change path
        if (this.dialogMode) {
            this.path = path;
            this.load(andSelect);
        } else {
            this.router.navigate([], { queryParams: { path }, queryParamsHandling: 'merge' });
        }
    }

    goUp() {
        const path = this.path.split('/').slice(0, -1).join('/') || '/';
        this.open(path);
    }

    closeQuickLook() {
        if (!this.quickLook) return;
        this.quickLook.close();
        this.element.nativeElement.focus();
    }

    async deleteSelected() {
        console.log('deleteSelected', this.selected);
        if (!this.selected.length) return;
        const a = await this.dialog.confirm('Delete', 'Are you sure you want to delete the selected files?');
        if (!a) return;
        await this.client.media.remove(this.filesystem, this.selected);
        await this.load();
    }

    selectBackground($event: MouseEvent) {
        if (this.state.media.view === 'icons') {
            this.selected = [];
            if (this.quickLook) this.quickLook.close();
        }
    }

    private getSelectedFileElementForQuickLook(): ElementRef | undefined {
        return this.thumbnails?.toArray().find(t => t.file.id === this.selected[this.selected.length - 1])?.elementRef;
    }

    select(file: MediaFile) {
        if (window.event instanceof PointerEvent || window.event instanceof KeyboardEvent) {
            if (window.event.shiftKey && this.selected.length) {
                // select all files between first in `files` and `file`
                const first = this.files.findIndex(v => v.id === this.selected[0]);
                const last = this.files.indexOf(file);
                this.selected = this.files.slice(Math.min(first, last), Math.max(first, last) + 1).map(v => v.id);
                return;
            }

            if (window.event.ctrlKey || window.event.metaKey) {
                if (this.selected.includes(file.id)) {
                    this.selected.splice(this.selected.indexOf(file.id), 1);
                } else {
                    this.selected.push(file.id);
                }
            } else {
                this.selected = [file.id];
            }
        } else {
            this.selected = [file.id];
        }

        this.filesSelected.emit(this.selected.map(v => this.files.find(f => f.id === v)!));
        if (this.quickLook) this.quickLook.setInitiator(this.getSelectedFileElementForQuickLook());
        this.cd.detectChanges();
    }

    ngOnDestroy() {
        this.lifecycle.destroy();
    }

    async upload(files: FilePickerItem | FilePickerItem[]) {
        if (!this.media) return;

        if (!Array.isArray(files)) files = [files];
        for (const file of files) {
            this.state.volatile.filesToUpload.push({
                filesystem: this.filesystem,
                dir: this.media.type === 'directory' ? this.media.path : this.media.directory,
                name: file.name,
                data: file.data,
            });
        }
        await this.events.dispatch(fileQueuedEvent);
    }

    getFolder() {
        return this.path || '/';
    }

    async createFolder() {
        const name = await this.dialog.prompt('Folder name', '');
        if (!name) return;
        await this.client.media.createFolder(this.filesystem, this.getFolder() + '/' + name);
        await this.load();
    }

    ngOnInit() {
        this.load();
    }

    async load(andSelect = false) {
        if (this.loading) return;

        this.loading = true;
        try {
            const path = this.getFolder();
            if (!this.dialogMode) {
                this.router.navigate([], { queryParams: { path }, queryParamsHandling: 'merge' });
            }
            this.media = await this.client.media.getFile(this.filesystem, path);
            console.log('this.media', this.media);
            if (this.media) this.activeFile.emit(this.media);
            if (this.media && andSelect) {
                //for what?
            }
            await this.loadActiveFolder();
        } finally {
            this.loading = false;
            this.cd.detectChanges();
        }
    }

    async loadActiveFolder() {
        if (this.media && this.media.type === 'directory') {
            await this.loadFolder(this.media.path);
        }
    }

    async loadFolder(dir: string) {
        this.files = await this.client.media.getFiles(this.filesystem, dir);
        console.log('files', this.files);
        this.sortFiles();
        this.cd.detectChanges();
    }
}
