/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ChangeDetectionStrategy, Component, HostListener, booleanAttribute, inject, input } from '@angular/core';
import { RouterLinkActive } from '@angular/router';

import { ValueAccessorBase, ngValueAccessor } from '../../core/form';

@Component({
    selector: 'dui-tab-button',
    template: ` <ng-content></ng-content> `,
    host: {
        '[attr.tabindex]': '1',
        '[class.active]': 'isActive()',
    },
    styleUrls: ['./tab-button.component.scss'],
    hostDirectives: [{ directive: RouterLinkActive, inputs: ['routerLinkActiveOptions'] }],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [ngValueAccessor(TabButtonComponent)],
})
export class TabButtonComponent extends ValueAccessorBase<any> {
    /**
     * Whether the button is active (pressed).
     *
     * Use alternatively form API, e.g. <dui-tab-button [(ngModel)]="chosen" value="overview"></dui-tab-button>
     */
    active = input(false, { transform: booleanAttribute });

    routerLinkActive = inject(RouterLinkActive);

    @HostListener('click')
    protected onClick() {
        const value = this.value();
        if (value === undefined) return;
        this.setValue(value);
    }

    protected isActive() {
        return this.routerLinkActive.isActive || this.active();
    }
}
