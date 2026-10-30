import { ChangeDetectionStrategy, Component, EventEmitter, Output, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent } from '@deepkit/desktop-ui';
import { TypeClass } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';

@Component({
    template: `
        <dui-input
            round
            lightFocus
            type="datetime-local"
            style="width: 100%"
            (keydown)="keyDown.emit($event)"
            [(ngModel)]="model().value"
        />
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [InputComponent, FormsModule],
})
export class DateInputComponent {
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeClass>();

    @Output() keyDown = new EventEmitter<KeyboardEvent>();
}
