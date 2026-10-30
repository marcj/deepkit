import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiRoute } from '@deepkit/api-console-api';
import {
    ButtonComponent,
    ButtonGroupComponent,
    DuiDialog,
    IconComponent,
    TabButtonComponent,
    TableColumnDirective,
    TableComponent,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent, ToggleBoxComponent } from '@deepkit/ui-library';

import { ControllerClient } from '../../client';
import { Request, Store } from '../../store';

@Component({
    selector: 'api-console-http-routes',
    template: `
        <dui-button-group style="margin: 6px 10px; margin-top: 12px;">
            <dui-tab-button
                (click)="switchViewRequest('selected')"
                [active]="store.state.viewHttp.viewRequests === 'selected'"
                >Selected</dui-tab-button
            >
            <dui-tab-button (click)="switchViewRequest('all')" [active]="store.state.viewHttp.viewRequests === 'all'"
                >All</dui-tab-button
            >
        </dui-button-group>

        <div class="requests overlay-scrollbar-small">
            @if (!requests().length) {
                <div class="no-requests">
                    @if (store.state.viewHttp.viewRequests === 'all') {
                        <div>No requests executed yet.</div>
                    }
                    @if (store.state.viewHttp.viewRequests === 'selected') {
                        <div>
                            @if (store.state.route) {
                                <div>No requests for this route executed yet.</div>
                            }
                        </div>
                    }
                    @if (!store.state.route) {
                        <div>Select a route in the left sidebar first.</div>
                    }
                    @if (store.state.route && store.state.routeStates[store.state.route.id]) {
                        <div>
                            Press
                            <dui-button icon="play" (click)="executeSelectedRoute.emit()"></dui-button>
                            to execute a new http request.
                        </div>
                    }
                </div>
            }

            @for (r of requests(); track $index; let i = $index) {
                <div class="request">
                    <div class="line">
                        <dui-icon
                            clickable
                            (click)="r.open = !isOpen(r, i)"
                            [name]="isOpen(r, i) ? 'arrow_down' : 'arrow_right'"
                        ></dui-icon>
                        <div class="method">{{ r.method }}</div>
                        <div class="url text-selection">
                            {{ r.url }}
                        </div>
                        <dui-icon
                            clickable
                            name="share"
                            [disabled]="r.method !== 'GET'"
                            (click)="openRequest(r)"
                        ></dui-icon>
                        <div class="status">
                            <div
                                class="status-box"
                                [class.orange]="isOrange(r.status)"
                                [class.red]="r.error || isRed(r.status)"
                            >
                                {{ r.status === 0 ? (r.error ? 'ERROR' : 'pending') : r.status }} {{ r.statusText }}
                            </div>
                        </div>
                        <dui-icon clickable (click)="remove(i)" name="garbage"></dui-icon>
                    </div>
                    @if (isOpen(r, i)) {
                        <div class="results">
                            <div class="request-info">
                                Executed at {{ r.created | date: 'short' }} in {{ r.took | number: '0.0-3' }} ms.
                                <code>{{ r.getHeader('content-type') }}</code>
                            </div>
                            <dui-button-group style="margin-bottom: 5px;">
                                <dui-tab-button (click)="r.tab = 'body'" [active]="r.tab === 'body'"
                                    >Body</dui-tab-button
                                >
                                <dui-tab-button (click)="r.tab = 'header'" [active]="r.tab === 'header'"
                                    >Header</dui-tab-button
                                >
                            </dui-button-group>
                            @if (r.tab === 'header') {
                                <dui-table [items]="r.headers" borderless no-focus-outline [virtualScrolling]="false">
                                    <dui-table-column
                                        name="name"
                                        [width]="180"
                                        class="text-selection"
                                    ></dui-table-column>
                                    <dui-table-column
                                        name="value"
                                        [width]="280"
                                        class="text-selection"
                                    ></dui-table-column>
                                </dui-table>
                            }
                            @if (r.tab === 'body') {
                                @if (r.error) {
                                    <div>{{ r.error }}</div>
                                }
                                @if (r.json !== undefined) {
                                    <div class="ts text-selection">
                                        <code-highlight lang="json" [code]="r.json"></code-highlight>
                                    </div>
                                }
                                @if (r.json === undefined) {
                                    <pre class="text-selection overlay-scrollbar-small" style="padding-bottom: 8px;">{{
                                        r.result
                                    }}</pre>
                                }
                            }
                        </div>
                    }
                </div>
            }
        </div>

        <deepkit-toggle-box
            title="Stats"
            [(visible)]="store.state.viewHttp.serverStatsVisible"
            (visibleChange)="store.store()"
        >
            <ng-container header> {{ requests().length }}/{{ store.state.requests.length }} requests </ng-container>
            TODO
        </deepkit-toggle-box>
    `,
    styleUrls: ['./results.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        ButtonGroupComponent,
        TabButtonComponent,
        ButtonComponent,
        IconComponent,
        DatePipe,
        DecimalPipe,
        TableComponent,
        TableColumnDirective,
        CodeHighlightComponent,
        ToggleBoxComponent,
    ],
})
export class HttpRequestsComponent {
    requests = signal<Request[]>([]);

    @Output() executeSelectedRoute = new EventEmitter();
    @Output() selectRoute = new EventEmitter<ApiRoute>();

    constructor(
        protected client: ControllerClient,
        public store: Store,
        public cd: ChangeDetectorRef,
        protected dialog: DuiDialog,
        protected router: Router,
    ) {}

    openRequest(r: Request) {
        window.open(r.url, '_blank');
    }

    isOrange(status: number): boolean {
        return status >= 400 && status < 500;
    }

    isRed(status: number): boolean {
        return status >= 500;
    }

    isOpen(r: Request, i: number): boolean {
        return r.open === undefined ? i === 0 : r.open;
    }

    updateRequests() {
        if (this.store.state.viewHttp.viewRequests === 'all') {
            this.requests.set(this.store.state.requests);
        } else {
            const route = this.store.state.route;
            if (route) {
                this.requests.set(
                    this.store.state.requests.filter(r => {
                        return route.id === r.id;
                    }),
                );
            } else {
                if (this.requests().length > 0) this.requests.set([]);
            }
        }
    }

    remove(index: number): void {
        this.store.set(state => {
            const removed = state.requests.splice(index, 1);
            for (const r of removed) {
                localStorage.removeItem('@deepkit/api-console/request/result/' + r.bodyStoreId);
                localStorage.removeItem('@deepkit/api-console/request/json/' + r.bodyStoreId);
            }
        });

        this.updateRequests();
    }

    switchViewRequest(view: 'all' | 'selected'): void {
        this.store.set(state => {
            state.viewHttp.viewRequests = view;
        });

        this.updateRequests();
    }

    toggleServerStatsVisibility() {
        this.store.set(state => {
            state.viewHttp.serverStatsVisible = !state.viewHttp.serverStatsVisible;
        });
    }
}
