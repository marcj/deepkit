import { DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
    QueryList,
    ViewChild,
    ViewChildren,
    computed,
    effect,
    forwardRef,
    inject,
    input,
    model,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MenuCheckboxDirective, MenuComponent, MenuItemComponent, MenuSeparatorComponent } from '../app/menu';
import { HumanFileSizePipe } from '../app/pipes';
import {
    ButtonComponent,
    ButtonGroupComponent,
    ButtonGroupsComponent,
    FileDropDirective,
    FilePickerDirective,
    FilePickerItem,
} from '../button/button.component';
import {
    ContextDropdownDirective,
    DropdownComponent,
    DropdownContainerDirective,
    DropdownItemComponent,
    DropdownSplitterComponent,
} from '../button/dropdown.component';
import { DuiDialog } from '../dialog/dialog';
import { IconComponent } from '../icon/icon.component';
import { InputComponent } from '../input/input.component';
import { TableCellDirective, TableColumnDirective, TableComponent } from '../table/table.component';
import { FilesystemApi, FilesystemApiFile, FilesystemState } from './api';
import { FilesystemFileDataCache, FilesystemFileQuickLookCache, FilesystemFileThumbnailCache } from './cache';
import { FilesystemFileDetail } from './components/file-detail.component';
import { FilesystemFileQuickLook } from './components/file-quick-look.component';
import { type ElementWithThumbnail, FilesystemFileThumbnail } from './components/file-thumbnail.component';
import { mimeTypeToLabel } from './utils';

function sortByName(a: FilesystemApiFile, b: FilesystemApiFile) {
    return a.path.localeCompare(b.path);
}

function sortByCreated(a: FilesystemApiFile, b: FilesystemApiFile) {
    const at = a.created?.getTime() || 0;
    const bt = b.created?.getTime() || 0;
    return at - bt;
}

function sortByModified(a: FilesystemApiFile, b: FilesystemApiFile) {
    const at = a.lastModified?.getTime() || 0;
    const bt = b.lastModified?.getTime() || 0;
    return at - bt;
}

function sortByMimeType(a: FilesystemApiFile, b: FilesystemApiFile) {
    return (a.mimeType || '').localeCompare(b.mimeType || '');
}

function sortBySize(a: FilesystemApiFile, b: FilesystemApiFile) {
    return a.size - b.size;
}

// folder first
function sortByType(a: FilesystemApiFile, b: FilesystemApiFile) {
    return a.type === 'directory' ? -1 : 1;
}

@Component({
    selector: 'dui-filesystem',
    template: `
        @let sort = this.sort();

        <dui-menu>
            <dui-menu-item label="File">
                <dui-menu-item label="New folder" (click)="createFolder()" />
                <dui-menu-item label="Upload" duiFilePicker duiFileMultiple (duiFilePickerChange)="upload($event)" />
            </dui-menu-item>
            <dui-menu-item label="Edit">
                <dui-menu-item label="Rename" (click)="renameFile.set(selected()[0])" [disabled]="!selected().length" />
                <dui-menu-item label="Delete" (click)="deleteSelected()" [disabled]="!selected().length" />
                <dui-menu-item label="Quick Look" (click)="openQuickLook()" [disabled]="!selected().length" />
            </dui-menu-item>
            <dui-menu-item label="View">
                <dui-menu-item label="Sort By">
                    <dui-menu-checkbox label="Name" [checked]="sort.by === 'name'" (click)="sortBy('name')" />
                    <dui-menu-checkbox label="Created" [checked]="sort.by === 'created'" (click)="sortBy('created')" />
                    <dui-menu-checkbox
                        label="Modified"
                        [checked]="sort.by === 'modified'"
                        (click)="sortBy('modified')"
                    />
                    <dui-menu-checkbox label="Type" [checked]="sort.by === 'type'" (click)="sortBy('type')" />
                    <dui-menu-checkbox label="Size" [checked]="sort.by === 'size'" (click)="sortBy('size')" />
                    <dui-menu-separator />
                    <dui-menu-checkbox
                        label="Ascending"
                        [checked]="sort.direction === 'asc'"
                        (click)="sortDirection('asc')"
                    />
                    <dui-menu-checkbox
                        label="Descending"
                        [checked]="sort.direction === 'desc'"
                        (click)="sortDirection('desc')"
                    />
                    <dui-menu-separator />
                    <dui-menu-checkbox
                        label="Folder first"
                        [checked]="sort.folderFirst"
                        (click)="toggleFolderFirst()"
                    />
                </dui-menu-item>
                <dui-menu-checkbox label="Icons" [checked]="view() === 'icons'" (click)="view.set('icons')" />
                <dui-menu-checkbox label="List" [checked]="view() === 'list'" (click)="view.set('list')" />
            </dui-menu-item>
        </dui-menu>

        <dui-button-groups>
            <dui-button-group padding="none" style="flex: 1;">
                <!--                <dui-button textured tight icon="arrow_left"></dui-button>-->
                <!--                <dui-button textured tight icon="arrow_right"></dui-button>-->
                <dui-button textured tight icon="reload" (click)="load()"></dui-button>
                <dui-button textured tight icon="arrow_up" (click)="goUp()"></dui-button>
                <dui-input style="flex: 1;" round textured [(ngModel)]="path" (enter)="load()"></dui-input>
            </dui-button-group>
            <!--        <dui-button-group>-->
            <!--          <dui-input icon="search" round placeholder="Search ..." textured></dui-input>-->
            <!--        </dui-button-group>-->
        </dui-button-groups>

        <dui-dropdown #contextMenu>
            <dui-dropdown-item [disabled]="!selected().length" (click)="open(filesSelected()[0]!.path)"
                >Open</dui-dropdown-item
            >
            <dui-dropdown-item [disabled]="!selected().length" (click)="openPublic(filesSelected()[0]!.path)"
                >Open Public URL</dui-dropdown-item
            >
            <!--        <dui-dropdown-item [disabled]="!selected().length" (click)="openPrivate(filesSelected()[0]!.path)">Open Private URL</dui-dropdown-item>-->
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item [disabled]="!selected().length" (click)="deleteSelected()">Delete</dui-dropdown-item>
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item [disabled]="!selected().length" (click)="renameFile.set(selected()[0])"
                >Rename</dui-dropdown-item
            >
            <!--            <dui-dropdown-item [disabled]="!selected().length">Duplicate</dui-dropdown-item>-->
            <dui-dropdown-item [disabled]="!selected().length" (click)="openQuickLook()">Quick Look</dui-dropdown-item>
            <!--            <dui-dropdown-splitter></dui-dropdown-splitter>-->
            <!--            <dui-dropdown-item [disabled]="!selected().length">Copy</dui-dropdown-item>-->
            <!--            <dui-dropdown-item [disabled]="!selected().length">Download</dui-dropdown-item>-->
            <!--            <dui-dropdown-item [disabled]="!selected().length">Share</dui-dropdown-item>-->
        </dui-dropdown>

        <dui-dropdown #quickLook [keepOpen]="true" normalize-style>
            <ng-container *dropdownContainer>
                @if (filesSelected(); as files) {
                    @if (files.length) {
                        <dui-filesystem-file-quick-look
                            (close)="closeQuickLook()"
                            [files]="files"
                            [api]="api()"
                        ></dui-filesystem-file-quick-look>
                    }
                }
            </ng-container>
        </dui-dropdown>

        @let media = this.media();

        <div
            class="content"
            [class.list]="view() === 'list'"
            [class.file]="media && media.type === 'file'"
            [class.overlay-scrollbar-small]="media && media.type === 'directory'"
            [class.folder]="media && media.type === 'directory'"
            (click)="selectBackground($event)"
            duiFileDrop
            duiFileDropMultiple
            (duiFileDropChange)="upload($event)"
            #container
            [contextDropdown]="contextMenu"
        >
            @if (!media && path() !== '/') {
                <div class="error">
                    <dui-icon name="error" />
                    <div class="message">Path {{ path() }} not found</div>
                </div>
            } @else {
                @if (media && media.type === 'file') {
                    <dui-filesystem-detail [file]="media" [api]="api()"></dui-filesystem-detail>
                }
                @if (media && media.type === 'directory') {
                    @if (view() === 'list') {
                        <dui-table
                            selectable
                            (selectedChange)="tableSelect($event)"
                            [items]="filesSorted()"
                            (rowDblClick)="open($event.path)"
                            no-focus-outline
                        >
                            <dui-table-column name="name" [width]="350">
                                <ng-container *duiTableCell="let item">
                                    <dui-filesystem-file-thumbnail
                                        [file]="item"
                                        [api]="api()"
                                        [view]="view()"
                                        (select)="select(item)"
                                        (renamed)="fileRenamed($event)"
                                        [rename]="item.path === renameFile()"
                                        [selected]="selected().includes(item.path)"
                                    />
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
                    @if (view() === 'icons') {
                        @for (file of filesSorted(); track $index) {
                            <dui-filesystem-file-thumbnail
                                [file]="file"
                                [api]="api()"
                                (select)="select(file)"
                                (renamed)="fileRenamed($event)"
                                [rename]="file.path === renameFile()"
                                (dblclick)="open(file.path)"
                                [selected]="selected().includes(file.path)"
                            />
                        }
                    }
                }
            }
        </div>
    `,
    styleUrl: './filesystem.component.scss',
    host: {
        '[attr.tabindex]': '0',
    },
    providers: [FilesystemFileDataCache, FilesystemFileQuickLookCache, FilesystemFileThumbnailCache],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DropdownComponent,
        DropdownItemComponent,
        FilePickerDirective,
        DropdownSplitterComponent,
        ButtonGroupsComponent,
        ButtonGroupComponent,
        ButtonComponent,
        InputComponent,
        FormsModule,
        FilesystemFileQuickLook,
        FileDropDirective,
        ContextDropdownDirective,
        IconComponent,
        FilesystemFileDetail,
        TableComponent,
        TableColumnDirective,
        TableCellDirective,
        HumanFileSizePipe,
        forwardRef(() => FilesystemFileThumbnail),
        DatePipe,
        DropdownContainerDirective,
        MenuComponent,
        MenuItemComponent,
        MenuCheckboxDirective,
        MenuSeparatorComponent,
    ],
})
export class FilesystemComponent implements OnInit, OnDestroy {
    mimeTypeToLabel = mimeTypeToLabel;

    api = input.required<FilesystemApi>();
    dialogMode = input(false);
    selectMultiple = input(false);

    path = model<string>('/');

    media = signal<FilesystemApiFile | undefined>(undefined);
    files = signal<FilesystemApiFile[]>([]);

    sort = signal<{ by: string; direction: 'asc' | 'desc'; folderFirst: boolean }>({
        by: 'name',
        direction: 'asc',
        folderFirst: true,
    });

    view = model<'icons' | 'list'>('icons');

    selected = model<string[]>([]);

    renameFile = model<string | undefined>(undefined);

    containerElementRef = viewChild.required('container', { read: ElementRef });

    loading = signal(false);

    filesSelected = computed(() => {
        const selected = new Set(this.selected());
        return this.files().filter(file => selected.has(file.path));
    });

    filesSorted = computed(() => {
        const sort = this.sort();
        const files = this.files().slice();

        if (sort.by === 'name') {
            files.sort(sortByName);
        } else if (sort.by === 'size') {
            files.sort(sortBySize);
        } else if (sort.by === 'created') {
            files.sort(sortByCreated);
        } else if (sort.by === 'modified') {
            files.sort(sortByModified);
        } else if (sort.by === 'type') {
            files.sort(sortByMimeType);
        }

        if (sort.direction === 'desc') files.reverse();
        if (sort.folderFirst) files.sort(sortByType);

        return files;
    });

    activeFile = output<FilesystemApiFile>();

    @ViewChild('quickLook', { read: DropdownComponent }) quickLook?: DropdownComponent;

    @ViewChildren(FilesystemFileThumbnail, { read: FilesystemFileThumbnail })
    thumbnails?: QueryList<FilesystemFileThumbnail>;

    element = inject(ElementRef);
    dialog = inject(DuiDialog);
    state = inject(FilesystemState);
    intersectionObserver?: IntersectionObserver;

    constructor() {
        effect(async () => {
            const path = this.path();
            if (!path) return;
            this.loading.set(true);
            try {
                const media = await this.api().getFile(path);
                this.media.set(media);
                if (media && media.type === 'directory') {
                    this.files.set(await this.api().getFiles(path));
                } else {
                    this.files.set([]);
                }
            } catch (error) {
                this.media.set(undefined);
                this.files.set([]);
            } finally {
                this.loading.set(false);
            }
        });
        effect(() => {
            const container = this.containerElementRef().nativeElement;
            if (this.intersectionObserver) {
                this.intersectionObserver.disconnect();
            }
            this.intersectionObserver = new IntersectionObserver(
                entries => {
                    for (const entry of entries) {
                        const thumbnail = (entry.target as ElementWithThumbnail).thumbnail as FilesystemFileThumbnail;
                        if (!thumbnail) continue;
                        thumbnail.intersection.set(entry.isIntersecting);
                    }
                },
                {
                    root: container,
                    threshold: 0.1,
                },
            );
        });
    }

    registerThumbnail(thumbnail: FilesystemFileThumbnail) {
        if (!this.intersectionObserver) return;
        const element = thumbnail.elementRef.nativeElement;
        this.intersectionObserver.observe(element);
    }

    unregisterThumbnail(thumbnail: FilesystemFileThumbnail) {
        if (!this.intersectionObserver) return;
        const element = thumbnail.elementRef.nativeElement;
        this.intersectionObserver.unobserve(element);
    }

    // constructor(
    //     private element: ElementRef,
    //     private dialog: DuiDialog,
    //     public router: Router,
    //     public activatedRoute: ActivatedRoute,
    //     public events: EventDispatcher,
    // ) {
    //     this.lifecycle.add(this.events.listen(fileAddedEvent, () => this.load()));
    //     this.lifecycle.add(this.events.listen(fileUploadedEvent, () => this.load()));
    //     activatedRoute.queryParams.subscribe(params => {
    //         if (params.path) {
    //             this.path = params.path;
    //             this.load();
    //         }
    //     });
    // }

    tableSelect(selected: FilesystemApiFile[]) {
        this.selected.set(selected.map(v => v.path));
    }

    sortBy(by: string) {
        this.sort.update(v => ({ ...v, by }));
    }

    sortDirection(direction: 'asc' | 'desc') {
        this.sort.update(v => ({ ...v, direction }));
    }

    toggleFolderFirst() {
        this.sort.update(v => ({ ...v, folderFirst: !v.folderFirst }));
    }

    async fileRenamed(newName?: string) {
        const file = this.renameFile();
        if (!file) return;
        try {
            if (!newName) return;
            await this.api().renameFile(file, newName);
        } finally {
            this.renameFile.set(undefined);
            this.element.nativeElement.focus();
        }
        await this.loadActiveFolder();
    }

    @HostListener('keydown', ['$event'])
    keyDown(event: KeyboardEvent) {
        if (this.renameFile()) return;
        const selected = this.selected();

        if (event.key === 'Enter') {
            this.renameFile.set(selected[0]);
        }

        if (event.key === 'Delete') {
            void this.deleteSelected();
        } else if (event.key === ' ') {
            if (!this.quickLook) return;
            if (this.quickLook.isOpen()) {
                this.quickLook.close();
            } else {
                this.openQuickLook();
            }
        }

        if (this.thumbnails) {
            const thumbnails: { element: ElementRef; file: FilesystemApiFile }[] = this.thumbnails
                .toArray()
                .map(v => ({ element: v.elementRef, file: v.file() }));
            const found = thumbnails.find(t => t.file.path === selected[selected.length - 1]);
            if (!found) {
                //special handling
                return;
            }
            const selectedRect = found?.element.nativeElement.getBoundingClientRect();
            let index = thumbnails.findIndex(t => t.file.path === selected[selected.length - 1]);

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
        if (!this.selected().length) return;
        const selected = this.getSelectedFileElementForQuickLook();
        this.quickLook.open('center', selected);
    }

    // async openPrivate(path: string) {
    //     const url = await this.api().getPrivateUrl(path);
    //     open(url, '_blank');
    // }

    async openPublic(path: string) {
        const url = await this.api().getPublicUrl(path);
        open(url, '_blank');
    }

    open(path: string, andSelect = false) {
        this.path.set(path);
        void this.load(andSelect);
    }

    goUp() {
        const path = this.path().split('/').slice(0, -1).join('/') || '/';
        this.open(path);
    }

    closeQuickLook() {
        if (!this.quickLook) return;
        this.quickLook.close();
        this.element.nativeElement.focus();
    }

    async deleteSelected() {
        const selected = this.selected();
        if (!selected.length) return;
        const a = await this.dialog.confirm('Delete', 'Are you sure you want to delete the selected files?');
        if (!a) return;
        await this.api().remove(selected);
        await this.load();
    }

    selectBackground(event: MouseEvent) {
        if (this.view() === 'icons') {
            if (event.target instanceof Element && event.target.closest('dui-filesystem-file-thumbnail')) return;
            this.selected.set([]);
            if (this.quickLook) this.quickLook.close();
        }
    }

    private getSelectedFileElementForQuickLook(): ElementRef | undefined {
        const selected = this.selected();
        const thumbnail = this.thumbnails?.toArray().find(t => t.file().path === selected[selected.length - 1]);
        if (!thumbnail) return;
        const image = thumbnail.image();
        return image?.nativeElement || thumbnail.elementRef.nativeElement;
    }

    select(file: FilesystemApiFile) {
        const selected = this.selected();
        const files = this.filesSorted();

        if (window.event instanceof PointerEvent || window.event instanceof KeyboardEvent) {
            if (window.event.shiftKey && this.selected().length) {
                // select all files between first in `files` and `file`
                const first = files.findIndex(v => v.path === selected[0]);
                const last = files.indexOf(file);
                this.selected.set(files.slice(Math.min(first, last), Math.max(first, last) + 1).map(v => v.path));
                return;
            }

            if (window.event.ctrlKey || window.event.metaKey) {
                if (selected.includes(file.path)) {
                    selected.splice(selected.indexOf(file.path), 1);
                } else {
                    selected.push(file.path);
                }
            } else {
                this.selected.set([file.path]);
            }
        } else {
            this.selected.set([file.path]);
        }

        if (this.quickLook) {
            this.quickLook.setInitiator(this.getSelectedFileElementForQuickLook());
        }
    }

    ngOnDestroy() {}

    upload(files: FilePickerItem[]) {
        const media = this.media();
        const dir = media && media.type === 'directory' ? media.path : this.path();

        for (const file of files) {
            this.state.addUpload({
                addFile: (...args) => this.api().addFile(...args),
                dir,
                name: file.name,
                data: file.data,
            });
        }
    }

    getFolder() {
        return this.path() || '/';
    }

    async createFolder() {
        const name = await this.dialog.prompt('Folder name', '');
        if (!name) return;
        await this.api().createFolder(this.getFolder() + '/' + name);
        await this.load();
    }

    ngOnInit() {
        this.load();
    }

    async load(andSelect = false) {
        if (this.loading()) return;
        const media = this.media();
        this.loading.set(true);
        try {
            const path = this.getFolder();
            this.media.set(await this.api().getFile(path));
            if (media) this.activeFile.emit(media);
            if (media && andSelect) {
                //for what?
            }
            await this.loadActiveFolder();
        } finally {
            this.loading.set(false);
        }
    }

    async loadActiveFolder() {
        const media = this.media();
        if (media && media.type === 'directory') {
            await this.loadFolder(media.path);
        }
    }

    async loadFolder(dir: string) {
        this.files.set(await this.api().getFiles(dir));
    }
}
