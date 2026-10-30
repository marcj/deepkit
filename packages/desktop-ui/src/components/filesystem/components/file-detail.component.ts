import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input, model, signal } from '@angular/core';

import { ObjectURLPipe } from '../../app/pipes';
import { IndicatorComponent } from '../../indicator/indicator.component';
import { LoadingSpinnerComponent } from '../../indicator/loading-spinner.component';
import { FilesystemApi, FilesystemApiFile } from '../api';
import { CacheData, FilesystemFileDataCache } from '../cache';

@Component({
    selector: 'dui-filesystem-detail',
    template: `
        @if (cacheData(); as cacheData) {
            @if (cacheData.result(); as result) {
                @if (result.mimeType.startsWith('image/')) {
                    <img class="image" [src]="result.data | objectURL: result.mimeType" alt="File preview" />
                } @else if (result.mimeType.startsWith('video/')) {
                    <video controls autoplay>
                        <source [src]="result.data | objectURL: result.mimeType" type="{{ result.mimeType }}" />
                        Your browser does not support the video tag.
                    </video>
                } @else {
                    <iframe [src]="result.data | objectURL: result.mimeType" frameborder="0" height="100%" width="100%">
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
    `,
    styleUrl: './file-detail.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ObjectURLPipe, IndicatorComponent, ObjectURLPipe, LoadingSpinnerComponent],
})
export class FilesystemFileDetail implements OnDestroy {
    api = input.required<FilesystemApi>();
    file = input.required<FilesystemApiFile>();
    data = model<Uint8Array | undefined>(undefined);

    filesystemFileCache = inject(FilesystemFileDataCache);
    cacheData = signal<CacheData | undefined>(undefined);

    constructor() {
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
}
