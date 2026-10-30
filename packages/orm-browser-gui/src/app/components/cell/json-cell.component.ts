import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnInit } from '@angular/core';

import { isArray, isObject } from '@deepkit/core';

import { BrowserState } from '../../browser-state';
import { BinaryCellComponent } from './binary-cell.component';
import { objToString } from './utils';

@Component({
    selector: 'orm-browser-json-cell',
    template: `
        @switch (true) {
            @case (model === null) {
                <div class="null">null</div>
            }
            @case (model === undefined) {
                <div class="undefined">undefined</div>
            }
            @case (iBinary(model)) {
                <orm-browser-binary-cell [model]="model"></orm-browser-binary-cell>
            }
            @case (isDate(model)) {
                <span class="monospace">
                    {{ model | date: 'M/d/yy, h:mm:ss' }}<span class="date-ms">{{ model | date: '.SSS' }}</span>
                </span>
            }
            @default {
                {{ label }}
            }
        }
    `,
    styles: [
        `
            .undefined,
            .null {
                color: var(--dui-text-light);
            }

            .date-ms {
                color: var(--dui-text-light);
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [BinaryCellComponent, DatePipe],
})
export class JsonCellComponent implements OnChanges, OnInit {
    @Input() model: any;

    label: string = '';

    constructor(
        public state: BrowserState,
        protected cd: ChangeDetectorRef,
    ) {}

    iBinary(v: any): boolean {
        return v instanceof ArrayBuffer || ArrayBuffer.isView(v);
    }

    isDate(v: any): boolean {
        return v instanceof Date;
    }

    ngOnChanges() {
        this.setLabel();
    }

    ngOnInit() {
        this.setLabel();
    }

    setLabel(): void {
        if (isObject(this.model) || isArray(this.model)) {
            this.label = objToString(this.model);
        } else {
            this.label = this.model;
        }
    }
}
