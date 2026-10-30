import { ChangeDetectionStrategy, Component, EventEmitter, Output, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent } from '@deepkit/desktop-ui';
import { ReflectionKind, Type, getSerializeFunction, serializer } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';

@Component({
    template: `
        <dui-input
            lightFocus
            type="textarea"
            style="width: 100%"
            [(ngModel)]="jsonContent"
            (ngModelChange)="jsonDone()"
        ></dui-input>
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
    imports: [InputComponent, FormsModule],
})
export class JsonInputComponent {
    model = input.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<Type>();

    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    jsonContent = '';

    getType(): string {
        const type = this.type();
        if (type.kind === ReflectionKind.number || type.kind === ReflectionKind.bigint) return 'number';

        return 'text';
    }

    jsonDone() {
        try {
            const obj = JSON.parse(this.jsonContent);
            this.model().value.set(getSerializeFunction(this.type(), serializer.deserializeRegistry)(obj));
        } catch (error) {}
    }
}
