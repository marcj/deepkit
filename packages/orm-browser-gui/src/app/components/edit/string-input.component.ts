import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent } from '@deepkit/desktop-ui';
import { ReflectionKind, Type } from '@deepkit/type';

@Component({
    template: `
        <dui-input
            round
            textured
            lightFocus
            [type]="getType()"
            auto-focus
            style="width: 100%"
            (blur)="done.emit()"
            (enter)="done.emit()"
            (esc)="done.emit()"
            (keydown)="keyDown.emit($event)"
            [(ngModel)]="model"
            (ngModelChange)="modelChange.emit(this.model)"
        ></dui-input>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [InputComponent, FormsModule],
})
export class StringInputComponent {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() type!: Type;

    @Output() done = new EventEmitter<void>();
    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    getType(): string {
        if (this.type.kind === ReflectionKind.number || this.type.kind === ReflectionKind.bigint) return 'number';

        return 'text';
    }
}
