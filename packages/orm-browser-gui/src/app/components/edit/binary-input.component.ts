import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';

import { isArray } from '@deepkit/core';
import { ButtonComponent, FilePickerDirective, FilePickerItem } from '@deepkit/desktop-ui';
import { ReflectionKind, Type } from '@deepkit/type';

@Component({
    template: `
        <dui-button duiFilePicker [duiFileAutoOpen]="true" (duiFilePickerChange)="chosen($event)">
            Choose file
        </dui-button>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ButtonComponent, FilePickerDirective],
})
export class BinaryInputComponent implements OnInit, OnChanges {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() type!: Type;

    @Output() done = new EventEmitter<void>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    chosen(event: FilePickerItem[]) {
        event = isArray(event) ? event : [event];
        const file = event[0];
        if (!file) return;

        this.model =
            this.type.kind === ReflectionKind.class && this.type.classType === ArrayBuffer
                ? file.data.buffer
                : file.data;
        this.modelChange.emit(this.model);

        this.done.emit();
    }

    ngOnChanges(): void {}

    ngOnInit(): void {}
}
