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
import { Type, TypeClass, TypeObjectLiteral, getKeyType, getValueType } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';
import { InputComponent } from './input.component';

@Component({
    template: `
        @if (model() && valueType && keyType) {
            @for (item of model().children(); track $index; let i = $index; let last = $last) {
                <div class="item">
                    <api-console-input
                        style="margin-right: 5px;"
                        [type]="keyType"
                        [model]="item.getProperty('key')"
                        (keyDown)="keyDown.emit($event)"
                    ></api-console-input>
                    <api-console-input
                        [type]="valueType"
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
            <dui-button square icon="add" (click)="add()"></dui-button>
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

            .item > * {
                flex: 1;
            }

            .item dui-icon {
                flex: 0;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [forwardRef(() => InputComponent), IconComponent, ButtonComponent],
})
export class MapInputComponent implements OnInit, OnChanges {
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeObjectLiteral | TypeClass>(); //object literal with index signature or type class with Map classType
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    keyType?: Type;
    valueType?: Type;

    ngOnChanges(): void {
        this.keyType = getKeyType(this.type());
        this.valueType = getValueType(this.type());
    }

    ngOnInit(): void {
        this.keyType = getKeyType(this.type());
        this.valueType = getValueType(this.type());
    }

    up(i: DataStructure) {
        arrayMoveItem(this.model().children(), i, -1);
        this.model().children.update(v => v.slice());
    }

    down(i: DataStructure) {
        const model = this.model();
        arrayMoveItem(model.children(), i, +1);
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
