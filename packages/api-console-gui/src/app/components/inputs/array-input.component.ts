import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    OnChanges,
    OnInit,
    Output,
    forwardRef,
    input,
    model,
} from '@angular/core';

import { arrayMoveItem } from '@deepkit/core';
import { ButtonComponent, IconComponent } from '@deepkit/desktop-ui';
import { TypeArray } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';
import { InputComponent } from './input.component';

@Component({
    template: `
        @if (model() && type().type; as subType) {
            @for (item of model().children(); track $index; let i = $index; let last = $last) {
                <div class="item">
                    <api-console-input
                        [type]="subType"
                        [model]="item.getProperty('value')"
                        (keyDown)="keyDown.emit($event)"
                    ></api-console-input>
                    <dui-icon clickable name="arrow_up" [disabled]="i === 0" (click)="up(item)"></dui-icon>
                    <dui-icon clickable name="arrow_down" [disabled]="last" (click)="down(item)"></dui-icon>
                    <dui-icon clickable name="garbage" (click)="remove(i)"></dui-icon>
                </div>
            }
        }
        <div class="actions">
            <dui-button small square icon="add" (click)="add()"></dui-button>
        </div>
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

            .item api-console-input {
                flex: 1;
            }

            .item dui-button {
                flex: 0;
                margin-left: 3px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [forwardRef(() => InputComponent), IconComponent, ButtonComponent],
})
export class ArrayInputComponent implements OnInit, OnChanges {
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeArray>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    ngOnChanges(): void {}

    ngOnInit(): void {}

    up(i: DataStructure) {
        arrayMoveItem(this.model().children(), i, -1);
        this.model().children.update(v => v.slice());
    }

    down(i: DataStructure) {
        arrayMoveItem(this.model().children(), i, +1);
        this.model().children.update(v => v.slice());
    }

    remove(i: number) {
        this.model().children().splice(i, 1);
        this.model().children.update(v => v.slice());
    }

    add() {
        this.model().children().push(new DataStructure(undefined));
        this.model().children.update(v => v.slice());
    }
}
