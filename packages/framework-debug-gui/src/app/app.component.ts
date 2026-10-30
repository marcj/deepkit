/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import {
    ButtonComponent,
    ButtonGroupComponent,
    DuiApp,
    DuiStyleComponent,
    ListComponent,
    ListItemComponent,
    ListTitleComponent,
    WindowComponent,
    WindowContentComponent,
    WindowHeaderComponent,
    WindowSidebarComponent,
    WindowToolbarComponent,
    WindowToolbarContainerComponent,
} from '@deepkit/desktop-ui';
import { Database, DebugRequest, Filesystem } from '@deepkit/framework-debug-api';
import { DatabaseBrowserListComponent } from '@deepkit/orm-browser-gui';
import { Collection } from '@deepkit/rpc';
import { HeaderStatusBarComponent } from '@deepkit/ui-library';

import { ControllerClient } from './client';
import { FileUploaderComponent } from './components/file-uploader.component';

@Component({
    selector: 'app-root',
    template: `
        <dui-style />
        <dui-window normalize-style>
            <dui-window-header size="small">
                <dui-window-toolbar>
                    <dui-button-group>
                        <div style="position: relative; top: -2px; margin-right: 5px;">
                            <img class="logo visible-for-dark-mode" src="assets/deepkit_white.svg" />
                            <img class="logo visible-for-white-mode" theme-white src="assets/deepkit_black.svg" />
                            <span style="margin-left: 8px; display: inline-block; color: var(--dui-text-grey)"
                                >Framework Debugger</span
                            >
                        </div>
                    </dui-button-group>

                    <dui-button-group float="sidebar">
                        <dui-button
                            textured
                            (click)="sidebarVisible = !sidebarVisible"
                            icon="toggle_sidebar"
                        ></dui-button>
                    </dui-button-group>

                    <dui-window-toolbar-container name="main"></dui-window-toolbar-container>
                    <dui-window-toolbar-container name="orm-browser"></dui-window-toolbar-container>

                    <div class="top-right">
                        <app-file-uploader></app-file-uploader>
                        <deepkit-header-status-bar [client]="client.client" />
                    </div>
                </dui-window-toolbar>
            </dui-window-header>
            <dui-window-content
                [sidebarVisible]="sidebarVisible"
                [class.no-padding]="router.url.startsWith('/database/') || router.url.startsWith('/api/')"
            >
                <dui-window-sidebar>
                    <dui-list>
                        <dui-list-title>Application</dui-list-title>
                        <dui-list-item routerLink="/configuration">Configuration</dui-list-item>
                        <dui-list-item routerLink="/http" [routerLinkActiveOptions]="{ exact: true }"
                            >HTTP</dui-list-item
                        >
                        <dui-list-item routerLink="/rpc">RPC</dui-list-item>
                        <dui-list-item routerLink="/events">Events</dui-list-item>
                        <dui-list-item routerLink="/modules">Modules</dui-list-item>
                        <dui-list-item routerLink="/profiler">Profiler</dui-list-item>
                        <dui-list-item routerLink="/api/console">API</dui-list-item>
                        <!--                        <dui-list-item routerLink="/broker">Broker</dui-list-item>-->
                        <dui-list-item routerLink="/http/request">HTTP Requests</dui-list-item>

                        <dui-list-title>Filesystem</dui-list-title>
                        @for (filesystem of filesystems; track filesystem; let i = $index) {
                            <dui-list-item routerLink="/filesystem/{{ i }}">{{ filesystem.name }}</dui-list-item>
                        }

                        <dui-list-title>Database</dui-list-title>
                        <orm-browser-list></orm-browser-list>

                        @if (requests | async; as rs) {
                            @if (rs.length > 0) {
                                <dui-list-title>HTTP Requests</dui-list-title>
                                @for (request of filterRequests(rs); track request) {
                                    <dui-list-item routerLink="/http/request/{{ request.id }}">
                                        <div class="request-line">
                                            <div class="id">#{{ request.id }}</div>
                                            <div class="method">{{ request.method }}</div>
                                            <div class="status">{{ request.statusCode }}</div>
                                            <div class="icons"></div>
                                        </div>
                                        <div class="request-subline">
                                            {{ request.url }}
                                        </div>
                                    </dui-list-item>
                                }
                            }
                        }
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
        FileUploaderComponent,
        AsyncPipe,
        HeaderStatusBarComponent,
        WindowContentComponent,
        WindowSidebarComponent,
        ListComponent,
        ListItemComponent,
        ListTitleComponent,
        RouterLink,
        DatabaseBrowserListComponent,
        RouterOutlet,
    ],
})
export class AppComponent implements OnInit, OnDestroy {
    databases: Database[] = [];
    filesystems: Filesystem[] = [];

    sidebarVisible: boolean = true;

    requests?: Collection<DebugRequest>;

    constructor(
        public duiApp: DuiApp,
        public client: ControllerClient,
        protected cd: ChangeDetectorRef,
        public router: Router,
    ) {
        client.client.transporter.reconnected.subscribe(() => {
            this.load();
        });
    }

    ngOnDestroy(): void {}

    filterRequests(requests: DebugRequest[]): DebugRequest[] {
        requests.sort(function (a, b) {
            if (a.id > b.id) return -1;
            if (a.id < b.id) return +1;
            return 0;
        });
        return requests.slice(0, 10);
    }

    // get requestObservable(): Observable<DebugRequest[]> | undefined {
    //     return this.requests;
    // }

    async load() {
        this.databases = await this.client.debug.databases();
        this.filesystems = await this.client.debug.filesystems();
        // this.requests = await this.controllerClient.getHttpRequests();
        this.cd.detectChanges();
    }

    async ngOnInit() {
        await this.load();
    }
}
