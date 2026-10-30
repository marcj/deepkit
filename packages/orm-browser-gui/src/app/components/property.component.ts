import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';

import { IconComponent } from '@deepkit/desktop-ui';
import { Type, defaultValue, isAutoIncrementType } from '@deepkit/type';

import { isRequired } from '../utils';
import { CellComponent } from './cell/cell.component';
import { InputEditingComponent } from './edit/input.component';

@Component({
    selector: 'orm-browser-property',
    template: `
        <div
            class="cell"
            tabindex="0"
            (focus)="editing = true"
            (click)="editing = true"
            [class.editing]="editing"
            [class.inactive]="!editing"
        >
            @if (!editing && model === undefined) {
                <div class="undefined">undefined</div>
            }
            @if (!editing && model === null) {
                <div class="null">null</div>
            }
            @if (editing || (model !== null && model !== undefined)) {
                @if (!editing) {
                    <orm-browser-property-view [model]="model" [type]="type"></orm-browser-property-view>
                }
                @if (editing) {
                    <orm-browser-property-editing
                        (modelChange)="model = $event; modelChange.emit(model)"
                        (done)="editing = false"
                        [type]="type"
                        [model]="model"
                    ></orm-browser-property-editing>
                }
            }
        </div>
        @if (!isAutoIncrementType(type) && !editing) {
            <div class="actions">
                <dui-icon
                    name="clear"
                    clickable
                    title="Unset"
                    (click)="unset(); $event.stopPropagation()"
                    [class.active]="!isRequired(type)"
                ></dui-icon>
            </div>
        }
    `,
    styles: [
        `
            :host {
                display: block;
                position: relative;
                height: 100%;
            }

            .actions {
                position: absolute;
                right: 2px;
                top: 0;
                display: none;
            }

            :host:hover .actions {
                display: block;
            }

            .undefined,
            .null {
                color: var(--dui-text-light);
            }

            .cell {
                min-height: 21px;
                padding: 0 4px;
                height: 100%;
                display: flex;
                align-items: center;
            }

            .cell ::ng-deep > ng-component {
                display: block;
                width: 100%;
            }

            .cell.editing {
                padding: 0;
            }

            .cell.inactive {
                border: 1px solid var(--dui-line-color-light);
                border-radius: 2px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CellComponent, InputEditingComponent, IconComponent],
})
export class PropertyComponent {
    @Input() model!: any;
    @Output() modelChange = new EventEmitter<any>();
    @Input() type!: Type;
    editing: boolean = false;
    isRequired = isRequired;
    isAutoIncrementType = isAutoIncrementType;

    constructor(protected cd: ChangeDetectorRef) {}

    unset() {
        this.model = defaultValue(this.type);
        this.modelChange.emit(this.model);
        this.cd.detectChanges();
    }
}
