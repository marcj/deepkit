/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ChangeDetectionStrategy, Component, OnDestroy, TemplateRef, ViewChild } from '@angular/core';

import { WindowContentComponent } from './window-content.component';

@Component({
    selector: 'dui-window-sidebar',
    template: `
        <ng-template #templateRef>
            <ng-content></ng-content>
        </ng-template>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./window-sidebar.component.scss'],
})
export class WindowSidebarComponent implements OnDestroy {
    @ViewChild('templateRef', { static: true }) template!: TemplateRef<any>;

    constructor(private content: WindowContentComponent) {
        content.registerSidebar(this);
    }

    ngOnDestroy() {
        this.content.unregisterSidebar(this);
    }
}
