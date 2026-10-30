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
    OnChanges,
    OnInit,
    booleanAttribute,
    input,
} from '@angular/core';

@Component({
    selector: 'dui-icon',
    template: `{{ name() }}`,
    host: {
        '[class.ui-icon]': 'true',
        '[style.font-size.px]': 'usedSize',
        '[style.height.px]': 'usedSize',
        '[style.width.px]': 'usedSize',
        '[style.color]': 'color()',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./icon.component.scss'],
})
export class IconComponent implements OnInit, OnChanges {
    /**
     * The icon for this button.
     */
    name = input.required<string>();

    /**
     * The icon size (default 17). Should not be necessary usually.
     */
    size = input<number>();

    /**
     * Enables interactive style for this icon.
     */
    clickable = input(false, { transform: booleanAttribute });

    /**
     * The color of the icon. If not set, it will use `currentColor` by default.
     */
    color = input<string>();

    /**
     * If true, the icon will be disabled and not clickable.
     */
    disabled = input<boolean>(false);

    protected usedSize = 17;

    @HostBinding('class.clickable')
    get isClickable() {
        return this.clickable();
    }

    @HostBinding('class.disabled')
    get isDisabled() {
        return this.disabled();
    }

    constructor() {}

    ngOnChanges(): void {
        const size = this.size();
        if (size) {
            this.usedSize = size;
        }

        const name = this.name();
        if (!size && name) {
            const pos = name.indexOf('_');
            if (pos !== -1) {
                const potentialNumber = parseInt(name.slice(0, pos), 10);
                if (potentialNumber) {
                    this.usedSize = potentialNumber;
                }
            }
        }
    }

    ngOnInit() {}
}
