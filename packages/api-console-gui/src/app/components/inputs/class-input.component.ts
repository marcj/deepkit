import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { OptionDirective, SelectBoxComponent } from '@deepkit/desktop-ui';
import { ReflectionClass, TypeClass, TypeObjectLiteral, isBackReferenceType, isReferenceType } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration, isReferenceLike } from '../../utils';
import { InputComponent } from './input.component';

@Component({
    template: `
        <div class="box children">
            @if (isReferenceLike(type())) {
                <dui-select textured style="width: 100%; margin-bottom: 5px;" [(ngModel)]="model().asReference">
                    <dui-option [value]="false">{{ schema().getClassName() }}</dui-option>
                    <dui-option [value]="true">Reference</dui-option>
                </dui-select>
            }
            @if (showOnlyPrimaryKey && schema().getPrimary(); as p) {
                <div style="padding: 4px;">
                    <api-console-input
                        [optional]="false"
                        [model]="model().getProperty(p.name)"
                        [type]="p.property"
                    ></api-console-input>
                </div>
            }
            @if (!showOnlyPrimaryKey) {
                @for (p of schema().getProperties(); track $index; let last = $last) {
                    <api-console-input
                        [class.last]="last"
                        [decoration]="p.property"
                        [model]="model().getProperty(p.name)"
                        [type]="p.property"
                    ></api-console-input>
                }
            }
        </div>
    `,
    styles: [
        `
            .children {
                position: relative;
                border: 1px solid var(--dui-line-color-light);
                border-radius: 3px;
                background-color: var(--dui-window-header-bg);
                margin-left: 20px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBoxComponent, FormsModule, OptionDirective, InputComponent],
})
export class ClassInputComponent {
    isReferenceLike = isReferenceLike;
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeClass | TypeObjectLiteral>();

    schema = computed(() => ReflectionClass.from(this.type()));

    get showOnlyPrimaryKey(): boolean {
        const type = this.type();
        return (isReferenceType(type) || isBackReferenceType(type)) && this.model().asReference();
    }
}
