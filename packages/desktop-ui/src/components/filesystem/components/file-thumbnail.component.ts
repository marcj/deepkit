import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    Inject,
    Input,
    OnDestroy,
    ViewChild,
    effect,
    forwardRef,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ObjectURLPipe } from '../../app/pipes';
import { LoadingSpinnerComponent } from '../../indicator/loading-spinner.component';
import { FilesystemApi, FilesystemApiFile, fileName, truncateFileName } from '../api';
import { CacheData, FilesystemFileThumbnailCache } from '../cache';
import { FilesystemComponent } from '../filesystem.component';

export type ElementWithThumbnail = Element & { thumbnail?: FilesystemFileThumbnail };

@Component({
    selector: 'dui-filesystem-file-thumbnail',
    template: `
        @let file = this.file();

        <div class="icon-container">
            @if (file.type === 'directory') {
                <div class="icon folder-icon"></div>
            } @else {
                @if (cacheData(); as cacheData) {
                    @if (cacheData.result(); as result) {
                        @if (result.mimeType.startsWith('image/')) {
                            <img #image [src]="result.data | objectURL: file.mimeType" />
                        } @else {
                            <div class="icon unknown-icon"></div>
                        }
                    } @else if (cacheData.invalid()) {
                        <div class="icon unknown-icon"></div>
                    } @else {
                        <dui-loading-spinner></dui-loading-spinner>
                    }
                } @else {
                    <div class="icon unknown-icon"></div>
                }
            }
        </div>

        @if (withTitle()) {
            <div class="title">
                @if (rename()) {
                    @if (view === 'icons') {
                        <textarea
                            #input
                            type="text"
                            [ngModel]="newName"
                            (ngModelChange)="setNewName($event)"
                            [ngModelOptions]="{ standalone: true }"
                            (blur)="doRename(undefined)"
                            (keydown.escape)="doRename(undefined, $event)"
                            (keydown.enter)="doRename(newName, $event)"
                        ></textarea>
                    } @else {
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
                } @else {
                    <span (contextmenu)="onContextMenu()" (click)="selectFile()">
                        @if (view === 'list') {
                            {{ fileName(file) }}
                        } @else {
                            {{ truncateFileName(fileName(file)) }}
                        }
                    </span>
                }
            </div>
        }
    `,
    host: {
        '[class.selected]': 'selected()',
        '[class.list]': `view === 'list'`,
    },
    styleUrl: './file-thumbnail.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [LoadingSpinnerComponent, FormsModule, ObjectURLPipe],
})
export class FilesystemFileThumbnail implements OnDestroy {
    truncateFileName = truncateFileName;
    fileName = fileName;

    loading = signal(true);
    loadingFailed = signal(false);
    thumbnailCache = inject(FilesystemFileThumbnailCache);
    cacheData = signal<CacheData | undefined>(undefined);

    newName = '';

    @Input() view: 'icons' | 'list' = 'icons';

    api = input.required<FilesystemApi>();

    file = input.required<FilesystemApiFile>();

    withTitle = input(true);
    selected = input(false);
    rename = input(false);

    intersection = signal(false);

    select = output<FilesystemApiFile>();
    renamed = output<string | undefined>();
    image = viewChild('image', { read: ElementRef });

    @ViewChild('input') set inputRef(ref: ElementRef) {
        if (!!ref) {
            setTimeout(() => {
                ref.nativeElement.focus();
                ref.nativeElement.setSelectionRange(0, this.newName.lastIndexOf('.') || this.newName.length);
            });
        }
    }

    elementRef = inject(ElementRef);

    setNewName(name: string) {
        this.newName = name.replace(/[\r\n]+/g, ' ').trim();
    }

    constructor(@Inject(forwardRef(() => FilesystemComponent)) private filesystemComponent: FilesystemComponent) {
        filesystemComponent.registerThumbnail(this);
        (this.elementRef.nativeElement as ElementWithThumbnail).thumbnail = this;
        effect(() => {
            const file = this.file();
            this.newName = fileName(file);
            this.loadingFailed.set(false);
        });

        effect(() => {
            const cacheData = this.cacheData();
            const intersection = this.intersection();
            const file = this.file();
            const api = this.api();
            if (intersection) {
                if (cacheData) {
                    if (cacheData.path === file.path) {
                        // Already connected
                        return;
                    } else {
                        // File has changed
                        cacheData.disconnect();
                    }
                }
                this.cacheData.set(this.thumbnailCache.connect(api, file.path));
            } else {
                if (!cacheData) return;
                cacheData.disconnect();
                this.cacheData.set(undefined);
            }
        });
    }

    ngOnDestroy() {
        this.filesystemComponent.unregisterThumbnail(this);
        this.cacheData()?.disconnect();
    }

    loaded(error: boolean = false) {
        this.loading.set(false);
        this.loadingFailed.set(error);
    }

    doRename(name: string | undefined, event?: Event) {
        this.renamed.emit(name);
        this.newName = fileName(this.file());
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
    }

    @HostListener('contextmenu')
    onContextMenu() {
        if (!this.selected()) {
            this.select.emit(this.file());
        }
    }

    @HostListener('click')
    selectFile() {
        this.select.emit(this.file());
    }
}
