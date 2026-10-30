/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {
    ButtonComponent,
    ButtonGroupComponent,
    DuiApp,
    DuiStyleComponent,
    ListComponent,
    ListTitleComponent,
    WindowComponent,
    WindowContentComponent,
    WindowHeaderComponent,
    WindowSidebarComponent,
    WindowToolbarComponent,
    WindowToolbarContainerComponent,
} from '@deepkit/desktop-ui';
import { HeaderStatusBarComponent } from '@deepkit/ui-library';

import { BrowserState } from './browser-state';
import { ControllerClient } from './client';
import { DatabaseBrowserListComponent } from './components/list.component';

@Component({
    selector: 'app-root',
    template: `
        <dui-style />
        <dui-window normalize-style>
            <dui-window-header size="small">
                <dui-window-toolbar>
                    <dui-button-group>
                        <div style="position: relative; top: 0px;">
                            <img class="logo visible-for-dark-mode" src="assets/deepkit_white.svg" />
                            <img class="logo visible-for-white-mode" theme-white src="assets/deepkit_black.svg" />

                            <span class="app-label">ORM Browser</span>
                        </div>
                    </dui-button-group>

                    <dui-button-group float="sidebar">
                        <dui-button
                            textured
                            (click)="sidebarVisible = !sidebarVisible"
                            icon="toggle_sidebar"
                        ></dui-button>
                    </dui-button-group>

                    <dui-window-toolbar-container name="orm-browser"></dui-window-toolbar-container>

                    <div class="top-right">
                        <deepkit-header-status-bar [client]="client.client" />
                    </div>
                </dui-window-toolbar>
            </dui-window-header>
            <dui-window-content [sidebarVisible]="sidebarVisible">
                <dui-window-sidebar>
                    <dui-list>
                        <dui-list-title>Database</dui-list-title>
                        <orm-browser-list></orm-browser-list>
                    </dui-list>
                </dui-window-sidebar>
                <router-outlet></router-outlet>
            </dui-window-content>
        </dui-window>
    `,
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        DuiStyleComponent,
        WindowComponent,
        WindowHeaderComponent,
        WindowToolbarComponent,
        ButtonGroupComponent,
        ButtonComponent,
        WindowToolbarContainerComponent,
        HeaderStatusBarComponent,
        WindowContentComponent,
        WindowSidebarComponent,
        ListComponent,
        ListTitleComponent,
        DatabaseBrowserListComponent,
        RouterOutlet,
        HeaderStatusBarComponent,
    ],
})
export class AppComponent implements OnDestroy {
    sidebarVisible: boolean = true;

    constructor(
        public duiApp: DuiApp,
        public client: ControllerClient,
        protected cd: ChangeDetectorRef,
        public state: BrowserState,
        public host: ElementRef<HTMLElement>,
    ) {
        const controller = host.nativeElement.getAttribute('controller');
        if (controller && controller !== 'APP_CONTROLLER_NAME') {
            this.client.setController(controller);
        }
    }

    ngOnDestroy(): void {}
}
