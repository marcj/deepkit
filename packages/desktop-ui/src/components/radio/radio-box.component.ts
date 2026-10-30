/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import {
    ChangeDetectionStrategy,
    Component,
    HostBinding,
    HostListener,
    booleanAttribute,
    inject,
    input,
} from '@angular/core';

import { ValueAccessorBase, ngValueAccessor } from '../../core/form';

/**
 * Radio group component to group multiple radio buttons together.
 */
@Component({
    selector: 'dui-radio-group',
    providers: [ngValueAccessor(RadioGroupComponent)],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: ` <ng-content></ng-content>`,
})
export class RadioGroupComponent extends ValueAccessorBase<any> {}

/**
 * Radio button component to toggle between multiple options.
 *
 * ```html
 * <dui-radio-group [(ngModel)]="myValue">
 *     <dui-radio-button value="a">Option A</dui-radio-button>
 *     <dui-radio-button value="b">Option B</dui-radio-button>
 * </dui-radio-group>
 */
@Component({
    selector: 'dui-radio-button',
    template: `
        <span class="box"><div class="circle"></div></span>
        <ng-content></ng-content>
    `,
    host: {
        '[class.dui-normalized]': 'true',
        '[class.disabled]': 'disabled()',
        '[class.checked]': 'isChecked',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./radio-box.component.scss'],
})
export class RadioButtonComponent {
    value = input<any>();

    disabled = input(false, { transform: booleanAttribute });

    group = inject(RadioGroupComponent);

    @HostBinding('tabindex')
    protected get tabIndex() {
        return 1;
    }

    @HostBinding('class.checked')
    protected get isChecked() {
        return this.value() === this.group.value();
    }

    @HostListener('click')
    protected onClick() {
        if (this.group.isDisabled) return;

        this.group.setValue(this.value());
        this.group.touch();
    }
}
