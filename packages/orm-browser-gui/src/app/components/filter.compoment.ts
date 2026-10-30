import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnInit,
    Output,
    SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { arrayRemoveItem } from '@deepkit/core';
import {
    ButtonComponent,
    ButtonGroupComponent,
    OptionDirective,
    OptionSeparatorDirective,
    SelectBoxComponent,
} from '@deepkit/desktop-ui';
import {
    ReflectionClass,
    ReflectionKind,
    Type,
    TypeProperty,
    TypePropertySignature,
    isBackReferenceType,
} from '@deepkit/type';

import { FilterItem } from '../browser-state';
import { PropertyComponent } from './property.component';

@Component({
    selector: 'orm-browser-filter-item',
    template: `
        <dui-select textured [(ngModel)]="property" (ngModelChange)="changed()">
            @for (property of properties; track $index) {
                <dui-option [value]="property">{{ String(property.name) }}</dui-option>
            }
        </dui-select>
        <dui-select textured [(ngModel)]="comparator" style="width: 72px;" (ngModelChange)="changed()">
            <dui-option value="$eq">=</dui-option>
            <dui-option value="$neq">!=</dui-option>
            <dui-option value="$gt">&gt;</dui-option>
            <dui-option value="$lt">&lt;</dui-option>
            <dui-option value="$gte">&gt;=</dui-option>
            <dui-option value="$lte">&lt;=</dui-option>
            <dui-option value="$regex">REGEX</dui-option>
            <dui-option-separator></dui-option-separator>
            <dui-option value="$in">IN</dui-option>
            <dui-option value="$nin">NOT IN</dui-option>
        </dui-select>
        @if (property && typeToShow) {
            <div class="value">
                <orm-browser-property
                    [model]="value"
                    (modelChange)="value = $event; changed()"
                    [type]="typeToShow"
                ></orm-browser-property>
            </div>
        }
    `,
    styles: [
        `
            :host {
                display: flex;
                width: 100%;
            }

            :host > * {
                margin-right: 4px;
            }

            .value {
                flex: 1;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBoxComponent, FormsModule, OptionDirective, OptionSeparatorDirective, PropertyComponent],
})
export class FilterItemComponent implements OnChanges, OnInit {
    String = String;
    @Input() model!: FilterItem;
    @Output() modelChange = new EventEmitter<FilterItem>();

    @Input() entity!: ReflectionClass<any>;
    @Input() properties: (TypeProperty | TypePropertySignature)[] = [];

    value: string = '';
    comparator: string = '$eq';
    typeToShow?: Type;
    property?: TypeProperty | TypePropertySignature;

    changed() {
        if (this.comparator !== this.model.comparator || (this.property && this.property.name !== this.model.name)) {
            this.typeToShow = undefined;
        }

        if (this.property) {
            this.model.name = String(this.property.name);
        }

        this.model.comparator = this.comparator;
        this.model.value = this.value;

        if (this.model.comparator === '$regex') {
            this.model.value = new RegExp(this.model.value);
        }

        this.modelChange.emit(this.model);

        this.loadProperty();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.model) {
            this.typeToShow = undefined;
            this.load();
        }
    }

    ngOnInit() {
        this.load();
    }

    protected loadProperty() {
        if (!this.property) this.property = this.properties[0];

        if (this.typeToShow) return;
        this.typeToShow = this.property.type;

        if (this.model.comparator === '$regex') {
            this.model.value = new RegExp(this.model.value);
            this.typeToShow = { kind: ReflectionKind.string };
        } else if (this.model.comparator === '$in' || this.model.comparator === '$nin') {
            this.typeToShow = { kind: ReflectionKind.array, type: this.property.type };
        }
    }

    load() {
        if (this.model.name) {
            this.property = this.properties.find(v => v.name === this.model.name);
        }

        if (!this.property) this.property = this.properties[0];

        this.comparator = this.model.comparator;
        this.value = this.model.value;

        if (this.model.comparator === '$regex') {
            if (this.model.value instanceof RegExp) {
                this.value = this.model.value.source;
            }
        }
        this.loadProperty();
    }
}

@Component({
    selector: 'orm-browser-filter',
    template: `
        @for (item of items; track $index; let i = $index) {
            <div class="item">
                <orm-browser-filter-item
                    [entity]="entity"
                    [(model)]="items[i]"
                    (modelChange)="itemsChange.emit(items)"
                    [properties]="properties"
                ></orm-browser-filter-item>
                <dui-button-group padding="none">
                    <dui-button
                        textured
                        tight
                        icon="garbage"
                        (click)="remove(item); itemsChange.emit(items)"
                    ></dui-button>
                </dui-button-group>
            </div>
        }
        @if (!items.length) {
            <div style="color: var(--dui-text-light)">No filter added yet.</div>
        }
        <div style="padding-top: 8px;">
            <dui-button textured icon="add" (click)="add()">Filter</dui-button>
        </div>
    `,
    styleUrls: ['./filter.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FilterItemComponent, ButtonGroupComponent, ButtonComponent],
})
export class FilterComponent implements OnChanges {
    @Input() entity!: ReflectionClass<any>;

    properties: (TypeProperty | TypePropertySignature)[] = [];

    @Input() items: FilterItem[] = [];
    @Output() itemsChange = new EventEmitter<FilterItem[]>();

    remove(item: FilterItem) {
        arrayRemoveItem(this.items, item);
    }

    add() {
        this.items.push({ name: String(this.properties[0].name), comparator: '$eq', value: '' });
        this.itemsChange.emit(this.items);
    }

    ngOnChanges(changes: any) {
        this.properties = [];
        for (const property of this.entity.getProperties()) {
            if (isBackReferenceType(property.type)) continue;
            this.properties.push(property.property);
        }
    }
}
