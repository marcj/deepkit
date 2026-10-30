import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
    ButtonComponent,
    CloseDialogDirective,
    DialogActionsComponent,
    DialogComponent,
    DuiDialog,
    InputComponent,
} from '@deepkit/desktop-ui';
import { ReflectionKind, Type, deserialize } from '@deepkit/type';

@Component({
    template: `
        @if (jsonEditor) {
            <dui-dialog
                class="class-field-dialog"
                noPadding
                [visible]="true"
                (closed)="done.emit()"
                [backDropCloses]="true"
                [minWidth]="450"
                [minHeight]="350"
            >
                <div class="json-editor">
                    <h3>JSON</h3>
                    <dui-input type="textarea" [(ngModel)]="jsonContent"></dui-input>
                </div>
                <dui-dialog-actions>
                    <dui-button closeDialog>Cancel</dui-button>
                    <dui-button (click)="jsonDone()">Ok</dui-button>
                </dui-dialog-actions>
            </dui-dialog>
        }
    `,
    styles: [
        `
            .json-editor {
                height: 100%;
                padding: 0 12px;
                display: flex;
                flex-direction: column;
            }

            .json-editor dui-input {
                margin-top: 15px;
                width: 100%;
                flex: 1;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DialogComponent,
        InputComponent,
        FormsModule,
        DialogActionsComponent,
        ButtonComponent,
        CloseDialogDirective,
    ],
})
export class JsonInputComponent {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() type!: Type;

    @Output() done = new EventEmitter<void>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    jsonEditor = false;
    jsonContent = '';

    constructor(protected duiDialog: DuiDialog) {}

    getType(): string {
        if (this.type.kind === ReflectionKind.number || this.type.kind === ReflectionKind.bigint) return 'number';

        return 'text';
    }

    jsonDone() {
        try {
            const obj = JSON.parse(this.jsonContent);
            this.model = deserialize(obj, undefined, undefined, undefined, this.type);
            this.modelChange.emit(this.model);

            this.jsonEditor = false;
            this.done.emit();
        } catch (error: any) {
            this.duiDialog.alert('Invalid JSON: ' + error);
        }
    }
}
