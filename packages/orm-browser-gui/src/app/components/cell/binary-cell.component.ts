import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnInit } from '@angular/core';
import * as FileSaver from 'file-saver';
import { filetypeinfo } from 'magic-bytes.js';

import {
    DropdownComponent,
    HumanFileSizePipe,
    IconComponent,
    ObjectURLPipe,
    OpenDropdownHoverDirective,
} from '@deepkit/desktop-ui';
import { Type } from '@deepkit/type';

import { TypeDecoration } from './utils';

@Component({
    selector: 'orm-browser-binary-cell',
    template: `
        @if (image) {
            <img [src]="image | objectURL" [openDropdownHover]="drop" style="max-height: 100%; max-width: 50px;" />
            <dui-dropdown #drop [width]="450" [height]="450">
                <div style="height: 100%; display: flex; justify-content: center; align-items: center">
                    <img [src]="image | objectURL" style="max-height: 100%; max-width: 100%;" />
                </div>
            </dui-dropdown>
        }
        @if (model && model.byteLength > 0) {
            <dui-icon
                name="download"
                (click)="download(); $event.preventDefault(); $event.stopPropagation()"
                clickable
            ></dui-icon>
        }
        @if (model) {
            <div class="bytes">
                {{ model.byteLength | fileSize }}
            </div>
        }
    `,
    styles: [
        `
            :host {
                height: 100%;
                display: flex;
                align-items: center;
            }

            dui-icon,
            .bytes {
                margin-left: 6px;
                color: var(--dui-text-light);
                font-size: 12px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [OpenDropdownHoverDirective, DropdownComponent, IconComponent, ObjectURLPipe, HumanFileSizePipe],
})
export class BinaryCellComponent implements OnInit, OnChanges {
    @Input() model: any;
    @Input() type?: Type;
    @Input() fileName: string = 'untitled';
    @Input() decoration?: TypeDecoration;

    image?: Uint8Array;
    ext: string = 'bin';

    constructor(public cd: ChangeDetectorRef) {}

    async display() {
        this.image = undefined;
        if (!this.model) return;

        const type = filetypeinfo(this.model)[0];
        if (type && type.mime?.startsWith('image/')) {
            this.image = this.model;
            this.ext = type.extension || 'bin';
        }

        this.cd.detectChanges();
    }

    download() {
        const blob = new Blob([this.model as BlobPart]);
        FileSaver.saveAs(blob, String(this.decoration?.name || this.fileName) + '.' + this.ext);
    }

    ngOnChanges(): void {
        this.display();
    }

    ngOnInit(): void {
        this.display();
    }
}
