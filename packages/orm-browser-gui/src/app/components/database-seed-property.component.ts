import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
    forwardRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { empty } from '@deepkit/core';
import {
    ButtonComponent,
    CheckboxComponent,
    CloseDialogDirective,
    DialogActionsComponent,
    DialogComponent,
    DuiDialog,
    InputComponent,
    OpenDialogDirective,
    OptionDirective,
    SelectBoxComponent,
} from '@deepkit/desktop-ui';
import { EntityPropertySeed, FakerTypes } from '@deepkit/orm-browser-api';
import {
    ReflectionKind,
    Type,
    TypeArray,
    TypeBoolean,
    TypeClass,
    TypeEnum,
    TypeObjectLiteral,
    isAutoIncrementType,
    isReferenceType,
    resolveClassType,
} from '@deepkit/type';

import { DatabaseSeedPropertiesComponent } from './database-seed-properties.component';
import { FakerTypeDialogComponent } from './dialog/faker-type-dialog.component';
import { PropertyComponent } from './property.component';

@Component({
    selector: 'orm-browser-seed-property',
    template: `
        @if (isAutoIncrementType(type)) {
            <ng-container style="color: var(--dui-text-grey)"> Auto-Increment </ng-container>
        }

        @if (!isAutoIncrementType(type)) {
            <dui-checkbox [(ngModel)]="model.fake" (ngModelChange)="changed()">Fake</dui-checkbox>
            @if (model.fake) {
                <div class="property-seed-value" [class.select]="isReferenceType(type)">
                    @switch (true) {
                        @case (isClassOrObjectLiteralType(type) && isReferenceType(type)) {
                            <div>
                                <dui-select textured small [(ngModel)]="model.reference">
                                    <dui-option value="random">Random from database</dui-option>
                                    <dui-option value="random-seed">Random from seed</dui-option>
                                    <dui-option value="create">Create new</dui-option>
                                </dui-select>
                                @if (model.reference === 'create') {
                                    <dui-dialog #classConfig [backDropCloses]="true">
                                        <orm-browser-seed-properties
                                            [fakerTypes]="fakerTypes"
                                            [entity]="resolveClassType(type)"
                                            [properties]="getSubProperties()"
                                            (changed)="changed()"
                                        ></orm-browser-seed-properties>
                                        <dui-dialog-actions>
                                            <dui-button closeDialog>OK</dui-button>
                                        </dui-dialog-actions>
                                    </dui-dialog>
                                    <dui-button style="width: 80px; margin-left: 6px;" [openDialog]="classConfig" small
                                        >Configure</dui-button
                                    >
                                }
                            </div>
                        }
                        @case (isEnumType(type)) {
                            <div class="choose-type">Random enum</div>
                        }
                        @case (isBooleanType(type)) {
                            <div class="choose-type">Random boolean</div>
                        }
                        @case (isClassOrObjectLiteralType(type) && !isReferenceType(type)) {
                            <div class="choose-type">
                                <dui-dialog #classConfig [backDropCloses]="true">
                                    <orm-browser-seed-properties
                                        [fakerTypes]="fakerTypes"
                                        [entity]="resolveClassType(type)"
                                        [properties]="getSubProperties()"
                                        (changed)="changed()"
                                    ></orm-browser-seed-properties>
                                    <dui-dialog-actions>
                                        <dui-button closeDialog>OK</dui-button>
                                    </dui-dialog-actions>
                                </dui-dialog>
                                <dui-button [openDialog]="classConfig" small>Configure</dui-button>
                            </div>
                        }
                        @case (isArrayType(type)) {
                            <div class="choose-type">
                                <dui-dialog #arrayConfig [backDropCloses]="true">
                                    <h3>Array configuration</h3>
                                    @if (model.getArray(); as array) {
                                        <div class="array-config">
                                            <div>Min</div>
                                            <dui-input type="number" [(ngModel)]="array.min"></dui-input>
                                            <div>Max</div>
                                            <dui-input type="number" [(ngModel)]="array.max"></dui-input>
                                        </div>
                                        <div>
                                            @if (isArrayType(type)) {
                                                <orm-browser-seed-property
                                                    [model]="array.seed"
                                                    [type]="type.type"
                                                    [fakerTypes]="fakerTypes"
                                                    (modelChange)="changed()"
                                                ></orm-browser-seed-property>
                                            }
                                        </div>
                                    }
                                    <dui-dialog-actions>
                                        <dui-button closeDialog>OK</dui-button>
                                    </dui-dialog-actions>
                                </dui-dialog>
                                <div>Array config</div>
                                <dui-button small [openDialog]="arrayConfig">Configure</dui-button>
                            </div>
                        }
                        <!--                <div class="choose-type" *ngIf="property.isMap">-->
                        <!--                    <dui-dialog #arrayConfig [backDropCloses]="true">-->
                        <!--                        <h3>Map configuration</h3>-->
                        <!--                        <ng-container *ngIf="model.getMap() as map">-->
                        <!--                            <div class="array-config">-->
                        <!--                                <div>Min</div>-->
                        <!--                                <dui-input type="number" [(ngModel)]="map.min"></dui-input>-->
                        <!--                                <div>Max</div>-->
                        <!--                                <dui-input type="number" [(ngModel)]="map.max"></dui-input>-->
                        <!--                            </div>-->
                        <!--                            <div>-->
                        <!--                                <orm-browser-seed-property-->
                        <!--                                    [model]="map.seed" [property]="property.getSubType()"-->
                        <!--                                    [fakerTypes]="fakerTypes" (modelChange)="changed()"></orm-browser-seed-property>-->
                        <!--                            </div>-->
                        <!--                        </ng-container>-->
                        <!--                        <dui-dialog-actions>-->
                        <!--                            <dui-button closeDialog>OK</dui-button>-->
                        <!--                        </dui-dialog-actions>-->
                        <!--                    </dui-dialog>-->
                        <!--                    <div>-->
                        <!--                        Map config-->
                        <!--                    </div>-->
                        <!--                    <dui-button small [openDialog]="arrayConfig">Configure</dui-button>-->
                        <!--                </div>-->
                        @default {
                            @if (!model.faker) {
                                <dui-button small (click)="chooseType()">Choose</dui-button>
                            }
                            @if (model.faker) {
                                <div class="choose-type">
                                    <div>
                                        {{ model.faker }}
                                        <span style="color: var(--dui-text-grey)">
                                            {{ fakerTypes[model.faker]?.type }}
                                        </span>
                                    </div>
                                    <dui-button (click)="chooseType()" small>Change</dui-button>
                                </div>
                            }
                        }
                    }
                </div>
            }
            @if (!model.fake) {
                <div class="property-seed-value">
                    <orm-browser-property [(model)]="model.value" [type]="type"></orm-browser-property>
                </div>
            }
        }
    `,
    styleUrls: ['./database-seed-property.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        CheckboxComponent,
        FormsModule,
        SelectBoxComponent,
        OptionDirective,
        DialogComponent,
        forwardRef(() => DatabaseSeedPropertiesComponent),
        DialogActionsComponent,
        ButtonComponent,
        CloseDialogDirective,
        OpenDialogDirective,
        InputComponent,
        PropertyComponent,
    ],
})
export class DatabaseSeedPropertyComponent implements OnInit {
    @Input() model!: EntityPropertySeed;
    @Output() modelChange = new EventEmitter<EntityPropertySeed>();
    @Input() type!: Type;
    @Input() fakerTypes!: FakerTypes;

    isAutoIncrementType = isAutoIncrementType;
    isReferenceType = isReferenceType;
    resolveClassType = resolveClassType;

    isArrayType(type: Type): type is TypeArray {
        return type.kind === ReflectionKind.array;
    }

    isEnumType(type: Type): type is TypeEnum {
        return type.kind === ReflectionKind.enum;
    }

    isBooleanType(type: Type): type is TypeBoolean {
        return type.kind === ReflectionKind.boolean;
    }

    isClassOrObjectLiteralType(type: Type): type is TypeClass | TypeObjectLiteral {
        return (
            (type.kind === ReflectionKind.class || type.kind === ReflectionKind.objectLiteral) && type.types.length > 0
        );
    }

    constructor(
        protected duiDialog: DuiDialog,
        protected cd: ChangeDetectorRef,
    ) {}

    changed() {
        this.modelChange.emit(this.model);
    }

    ngOnInit(): void {}

    getSubProperties(): { [name: string]: EntityPropertySeed } {
        if (!empty(this.model.properties)) return this.model.properties;
        if (this.type.kind !== ReflectionKind.class && this.type.kind !== ReflectionKind.objectLiteral) return {};

        const foreignSchema = resolveClassType(this.type);
        for (const property of foreignSchema.getProperties()) {
            if (property.isBackReference()) continue;

            this.model.properties[property.name] = new EntityPropertySeed(property.name);
        }

        return this.model.properties;
    }

    chooseType() {
        const { component } = this.duiDialog.open(FakerTypeDialogComponent, {
            fakerTypes: this.fakerTypes,
            selected: this.model.faker,
        });

        component.chosen.subscribe((value: string) => {
            this.model.faker = value;
            this.cd.detectChanges();
        });
    }
}
