import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnInit } from '@angular/core';

import { ReflectionClass, TypeClass, TypeObjectLiteral, isReferenceType } from '@deepkit/type';

import { BrowserState } from '../../browser-state';
import { objToString } from './utils';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: `{{ label }}` })
export class ClassCellComponent implements OnChanges, OnInit {
    @Input() model: any;
    @Input() type!: TypeClass | TypeObjectLiteral;

    schema?: ReflectionClass<any>;

    label: string = '';

    constructor(
        public state: BrowserState,
        protected cd: ChangeDetectorRef,
    ) {}

    ngOnChanges() {
        this.schema = ReflectionClass.from(this.type);
        this.setLabel();
    }

    ngOnInit() {
        this.setLabel();
    }

    setLabel(): void {
        this.schema = ReflectionClass.from(this.type);

        this.label = '';
        if (this.model === undefined || this.model === null) return;

        const value = this.model;

        if (isReferenceType(this.type)) {
            if (value === undefined) return;
            if (this.state.isIdWrapper(value)) {
                this.label = '#new-' + this.state.extractIdWrapper(value);
            } else {
                this.label = this.schema.getClassName() + '#' + value[this.schema.getPrimary().name];
            }
        } else {
            this.label = objToString(value);
        }
    }
}
