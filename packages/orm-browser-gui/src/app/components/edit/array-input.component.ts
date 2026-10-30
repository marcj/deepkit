import { JsonPipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnInit,
    Output,
    signal,
} from '@angular/core';

import { isArray } from '@deepkit/core';
import { ButtonComponent, CloseDialogDirective, DialogComponent } from '@deepkit/desktop-ui';
import { Type, TypeArray, defaultValue } from '@deepkit/type';

import { CellComponent } from '../cell/cell.component';
import { InputEditingComponent } from './input.component';

@Component({
    template: `
        @if (subType) {
            <dui-dialog [visible]="true" (closed)="done.emit()" [backDropCloses]="true">
                @if (model) {
                    @for (item of model; track $index; let i = $index) {
                        <div class="item">
                            <orm-browser-property-view [type]="subType" [model]="model[i]" />
                            <!--                <dui-button icon="garbage" tight (click)="remove(i)"></dui-button>-->
                        </div>
                    }
                }
                <div class="actions">
                    <dui-button closeDialog>Close</dui-button>
                    <!--            <dui-button (click)="add()">Add</dui-button>-->
                </div>
            </dui-dialog>
        }
    `,
    styles: [
        `
            .actions {
                margin-top: 6px;
            }

            .item {
                padding: 2px 0;
                display: flex;
            }

            .item dui-button {
                flex: 0;
                margin-left: 3px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogComponent, InputEditingComponent, ButtonComponent, CellComponent, JsonPipe, CloseDialogDirective],
})
export class ArrayInputComponent implements OnInit, OnChanges {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() type!: TypeArray;

    subType?: Type;

    editing = signal<number | false>(false);

    @Output() done = new EventEmitter<void>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    ngOnChanges(): void {
        if (!isArray(this.model)) this.model = [];
        this.subType = this.type.type;
    }

    editingIndex(): number {
        return this.editing() || 0;
    }

    ngOnInit(): void {
        if (!isArray(this.model)) this.model = [];
        this.subType = this.type.type;
    }

    remove(i: number) {
        if (isArray(this.model)) {
            this.model.splice(i, 1);
            this.modelChange.emit(this.model);
        }
    }

    addDone() {
        this.editing.set(false);
        this.modelChange.emit(this.model);
    }

    add() {
        if (!this.subType) return;
        if (!isArray(this.model)) this.model = [];
        this.model.push(defaultValue(this.subType));
        this.modelChange.emit(this.model);
        this.editing.set(this.model.length - 1);
    }
}
