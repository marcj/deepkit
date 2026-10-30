import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    OnChanges,
    OnInit,
    Output,
    input,
    model,
} from '@angular/core';

import { ButtonComponent, FilePickerDirective, FilePickerItem } from '@deepkit/desktop-ui';
import { TypeClass } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';

@Component({
    template: ` <dui-button duiFilePicker (duiFilePickerChange)="chosen($event)"> Choose file </dui-button> `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ButtonComponent, FilePickerDirective],
})
export class BinaryInputComponent implements OnInit, OnChanges {
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeClass>();

    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    chosen(event: FilePickerItem[]) {
        const file = event[0];
        if (!file) return;

        this.model().value.set(this.type().classType === ArrayBuffer ? file.data.buffer : file.data);
    }

    ngOnChanges(): void {}

    ngOnInit(): void {}
}
