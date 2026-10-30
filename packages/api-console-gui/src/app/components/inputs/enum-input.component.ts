import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    ViewChild,
    input,
    model,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { OptionDirective, SelectBoxComponent, unsubscribe } from '@deepkit/desktop-ui';
import { TypeEnum } from '@deepkit/type';

import { DataStructure } from '../../store';
import { TypeDecoration } from '../../utils.js';

@Component({
    template: `
        <dui-select #select [(ngModel)]="model().value" textured style="width: 100%">
            @for (kv of keyValues; track kv) {
                <dui-option [value]="kv.value">{{ kv.label }}</dui-option>
            }
        </dui-select>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBoxComponent, FormsModule, OptionDirective],
})
export class EnumInputComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
    model = model.required<DataStructure>();
    decoration = input<TypeDecoration>();
    type = input.required<TypeEnum>();

    keyValues: { value: any; label: string | number | undefined | null }[] = [];

    @Output() keyDown = new EventEmitter<KeyboardEvent>();

    @ViewChild('select') select?: SelectBoxComponent<any>;

    @unsubscribe()
    protected dropdownSub?: Subscription;

    ngOnDestroy() {}

    ngOnInit() {
        this.load();
    }

    ngOnChanges() {
        this.load();
    }

    ngAfterViewInit() {
        this.select?.open();
    }

    load() {
        this.type().enum;
        for (const [label, value] of Object.entries(this.type().enum)) {
            this.keyValues.push({ value, label });
        }
    }
}
