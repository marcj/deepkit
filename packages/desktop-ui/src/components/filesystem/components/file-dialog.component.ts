import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { ButtonComponent, ButtonGroupComponent } from '../../button/button.component';
import { CloseDialogDirective, DialogComponent } from '../../dialog/dialog.component';
import { FilesystemApi, FilesystemApiFile } from '../api';
import { FilesystemComponent } from '../filesystem.component';

@Component({
    styles: [
        `
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            app-media {
                flex: 1;
                overflow: hidden;
            }

            dui-button-group {
                justify-content: flex-end;
                margin-bottom: 10px;
            }
        `,
    ],
    imports: [FilesystemComponent, ButtonGroupComponent, ButtonComponent, CloseDialogDirective],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <dui-filesystem [api]="api()" [dialogMode]="true" (activeFile)="activeFile = $event" [(selected)]="selected" />
        <dui-button-group>
            <dui-button closeDialog>Cancel</dui-button>
            <dui-button (click)="choose()">Choose</dui-button>
        </dui-button-group>
    `,
})
export class FilesystemFileDialog {
    static dialogDefaults = {
        height: '90%',
        width: 750,
    };

    selected = signal<string[]>([]);
    activeFile?: FilesystemApiFile;

    api = input.required<FilesystemApi>();

    dialog = inject(DialogComponent);

    choose() {
        const selected = this.activeFile && this.activeFile.type === 'file' ? this.activeFile.path : this.selected()[0];
        this.dialog.close(selected);
    }
}
