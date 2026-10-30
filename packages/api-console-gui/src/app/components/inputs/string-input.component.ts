import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent } from '@deepkit/desktop-ui';
import { ReflectionKind, Type } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils';

@Component({
    template: `
        <dui-input
            lightFocus
            [type]="getType()"
            style="width: 100%"
            (keydown)="keyDown.emit($event)"
            [placeholder]="placeholder()"
            [(ngModel)]="model().value"
        ></dui-input>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [InputComponent, FormsModule],
})
export class StringInputComponent {
    String = String;
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<Type>();

    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    placeholder = computed(() => {
        const decoration = this.decoration();
        return decoration ? String(decoration.name) : '';
    });

    getType(): string {
        const type = this.type();
        if (type.kind === ReflectionKind.number || type.kind === ReflectionKind.bigint) return 'number';

        return 'text';
    }
}
