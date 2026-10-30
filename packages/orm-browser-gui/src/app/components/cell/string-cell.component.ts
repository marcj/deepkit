import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { Type } from '@deepkit/type';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: `{{ model }}` })
export class StringCellComponent {
    @Input() model: any;
    @Input() type!: Type;
}
