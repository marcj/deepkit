import { AsyncPipe, DatePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    HostListener,
    OnDestroy,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';

import { HumanFileSizePipe, ObjectURLPipe } from '../../app/pipes';
import { ButtonGroupComponent, ButtonGroupsComponent } from '../../button/button.component';
import { IconComponent } from '../../icon/icon.component';
import { IndicatorComponent } from '../../indicator/indicator.component';
import { LoadingSpinnerComponent } from '../../indicator/loading-spinner.component';
import { FilesystemApi, FilesystemApiFile, fileName } from '../api';
import { CacheData, FilesystemFileQuickLookCache } from '../cache';
import { imageSize, mimeTypeToLabel } from '../utils';

@Component({
    selector: 'dui-filesystem-file-quick-look',
    template: `
        @let files = this.files();
        <dui-button-groups>
            <dui-button-group>
                <dui-icon name="clear" (click)="close.emit()" clickable></dui-icon>
                @if (files.length > 1) {
                    <dui-icon name="arrow_left" (click)="prev()" clickable></dui-icon>
                }
                @if (files.length > 1) {
                    <dui-icon name="arrow_right" (click)="next()" clickable></dui-icon>
                }
                @if (file(); as file) {
                    <div>
                        {{ fileName(file) }}
                    </div>
                }
            </dui-button-group>
            <!--        <dui-button-group float="right">-->
            <!--          <dui-icon name="share" clickable></dui-icon>-->
            <!--        </dui-button-group>-->
        </dui-button-groups>
        <div class="overlay-scrollbar-small quick-look-content">
            @if (file(); as file) {
                @if (file.type === 'directory') {
                    <div class="icon folder-icon"></div>
                } @else {
                    @if (cacheData(); as cacheData) {
                        @if (cacheData.result(); as result) {
                            @if (result.mimeType.startsWith('image/')) {
                                <img
                                    class="image"
                                    [src]="result.data | objectURL: result.mimeType"
                                    alt="File preview"
                                />
                            } @else if (result.mimeType.startsWith('video/')) {
                                <video controls autoplay>
                                    <source
                                        [src]="result.data | objectURL: result.mimeType"
                                        type="{{ result.mimeType }}"
                                    />
                                    Your browser does not support the video tag.
                                </video>
                            } @else {
                                <iframe
                                    [src]="result.data | objectURL: result.mimeType"
                                    frameborder="0"
                                    height="100%"
                                    width="100%"
                                >
                                </iframe>
                            }
                        } @else if (cacheData.invalid()) {
                            <div class="icon unknown-icon"></div>
                        } @else {
                            <dui-loading-spinner></dui-loading-spinner>
                            <dui-indicator [step]="cacheData.progress()" />
                        }
                    } @else {
                        <div class="icon unknown-icon"></div>
                    }
                }
            }
        </div>
        @if (file(); as file) {
            <div class="stats text-selection">
                <div class="stat">
                    <div class="label">Size</div>
                    <div class="value">
                        <div>{{ file.size | fileSize }}</div>
                        @if (dim() | async; as dim) {
                            <div>{{ dim.width }}x{{ dim.height }}</div>
                        }
                    </div>
                </div>
                <div class="stat">
                    <div class="label">Type</div>
                    @if (cacheData()?.result(); as result) {
                        <div class="value">{{ mimeTypeToLabel(result.mimeType) }}</div>
                    } @else {
                        <div class="value">{{ mimeTypeToLabel(file.mimeType) }}</div>
                    }
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
    styleUrl: './file-quick-look.component.scss',
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
        LoadingSpinnerComponent,
        HumanFileSizePipe,
        AsyncPipe,
        IndicatorComponent,
    ],
})
export class FilesystemFileQuickLook implements OnDestroy {
    fileName = fileName;
    mimeTypeToLabel = mimeTypeToLabel;

    api = input.required<FilesystemApi>();
    files = input.required<FilesystemApiFile[]>();

    close = output();

    file = signal<FilesystemApiFile | undefined>(undefined);

    filesystemFileCache = inject(FilesystemFileQuickLookCache);
    cacheData = signal<CacheData | undefined>(undefined);

    dim = computed(() => {
        const result = this.cacheData()?.result();
        if (!result) return;
        if (!result.mimeType.startsWith('image/')) return;
        return imageSize(result.data);
    });

    constructor() {
        effect(() => {
            const files = this.files();
            const file = this.file();
            if (!file && files.length) {
                this.file.set(files[0]);
            }
        });
        effect(() => {
            const file = this.file();
            if (!file) {
                this.cacheData()?.disconnect();
                this.cacheData.set(undefined);
                return;
            }

            if (this.cacheData()?.path === file.path) return;
            const cacheData = this.filesystemFileCache.connect(this.api(), file.path);
            this.cacheData.set(cacheData);
        });
    }

    ngOnDestroy() {
        this.cacheData()?.disconnect();
    }

    next() {
        const files = this.files();
        const file = this.file();
        if (!file) return;
        const index = files.indexOf(file);
        if (index < files.length - 1) {
            this.select(files[index + 1]);
        } else {
            this.select(files[0]);
        }
    }

    prev() {
        const files = this.files();
        const file = this.file();
        if (!file) return;
        const index = files.indexOf(file);
        if (index > 0) {
            this.select(files[index - 1]);
        } else {
            this.select(files[files.length - 1]);
        }
    }

    @HostListener('keydown', ['$event'])
    onClose($event: KeyboardEvent) {
        if ($event.key === 'Escape' || $event.key === ' ') {
            $event.stopPropagation();
            this.close.emit();
        }
    }

    select(file: FilesystemApiFile) {
        if (this.file() === file) return;
        this.file.set(file);
    }
}
