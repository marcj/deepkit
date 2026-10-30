import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { OptionDirective, SelectBoxComponent, unsubscribe } from '@deepkit/desktop-ui';
import { TypeEnum } from '@deepkit/type';

@Component({
    template: `
        <dui-select
            #select
            [(ngModel)]="model"
            (ngModelChange)="modelChange.emit(this.model); done.emit()"
            textured
            style="width: 100%"
        >
            @for (kv of keyValues; track kv) {
                <dui-option [value]="kv.value">{{ kv.label }}</dui-option>
            }
        </dui-select>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SelectBoxComponent, FormsModule, OptionDirective],
})
export class EnumInputComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() type!: TypeEnum;

    keyValues: { value: any; label: string }[] = [];

    @Output() done = new EventEmitter<void>();
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
        for (const [label, value] of Object.entries(this.type.enum)) {
            this.keyValues.push({ value, label });
        }
    }
}
