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
import { FormsModule } from '@angular/forms';

import { OptionDirective, SelectBoxComponent } from '@deepkit/desktop-ui';
import { ReflectionKind, Type, TypeUnion, isType, stringifyType } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';
import { InputComponent } from './input.component';

interface Entry {
    type?: Type;
    value?: any;
    label: string;
}

@Component({
    template: `
        <dui-select
            style="width: 100%"
            textured
            [ngModel]="subProperty || model().value()"
            (ngModelChange)="set($event)"
        >
            @for (item of items; track $index) {
                @if (!item.type) {
                    <dui-option [value]="item.value">{{ item.label }}</dui-option>
                }
                @if (item.type) {
                    <dui-option [value]="item.type">{{ item.label }}</dui-option>
                }
            }
        </dui-select>
        @if (subProperty) {
            <div class="sub">
                <api-console-input
                    [model]="model().getProperty(model().typeIndex)"
                    [type]="subProperty"
                    (keyDown)="keyDown.emit($event)"
                ></api-console-input>
            </div>
        }
    `,
    styles: [
        `
            .sub {
                margin-top: 3px;
                margin-left: 1px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBoxComponent, FormsModule, forwardRef(() => InputComponent), OptionDirective],
})
export class UnionInputComponent implements OnInit, OnChanges {
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeUnion>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    items: Entry[] = [];

    subProperty?: Type;

    ngOnChanges(): void {
        this.init();
    }

    ngOnInit(): void {
        this.init();
    }

    set(e: Type | any) {
        const model = this.model();
        if (isType(e)) {
            this.subProperty = e;
            model.typeIndex = this.type().types.indexOf(e);
        } else {
            this.subProperty = undefined;
            model.typeIndex = -1;
            model.value.set(e);
        }
    }

    protected init() {
        this.items = [];
        this.subProperty = undefined;

        const type = this.type();
        if (!type.types.length) return;

        for (const p of type.types) {
            if (p.kind === ReflectionKind.literal) {
                this.items.push({ value: p.literal, label: String(p.literal) });
            } else {
                const label = stringifyType(p, { showFullDefinition: false });
                this.items.push({ type: p, label: label });
            }
        }

        if (this.model().typeIndex >= 0) {
            this.subProperty = type.types[this.model().typeIndex];
        } else if (this.model().value() === undefined) {
            const first = type.types[0];
            if (first.kind === ReflectionKind.literal) {
                this.set(first.literal);
            } else {
                this.set(first);
            }
        }
    }
}
