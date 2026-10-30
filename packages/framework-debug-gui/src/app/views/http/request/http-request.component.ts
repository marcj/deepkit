/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { AsyncPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { ButtonGroupComponent, TabButtonComponent } from '@deepkit/desktop-ui';
import { DebugRequest, Workflow } from '@deepkit/framework-debug-api';
import { EntitySubject } from '@deepkit/rpc';

import { ControllerClient } from '../../../client';
import { WorkflowCardComponent, WorkflowComponent } from '../../../components/workflow.component';

@Component({
    template: `
        @if (request | async; as request) {
            <div class="header">
                <h3>#{{ request.id }}</h3>
                <div class="text-selection">{{ request.method }} {{ request.url }}</div>
                <div class="text-selection">Status {{ request.statusCode }}</div>
                <div class="text-selection">{{ request.started | date: 'medium' }}</div>
                <div class="text-selection">Response time: {{ time(request.times['http']) }}</div>
            </div>
            <div>
                <dui-button-group>
                    <dui-tab-button [active]="true">Overview</dui-tab-button>
                    <dui-tab-button>Events (5)</dui-tab-button>
                    <dui-tab-button>Queries (5)</dui-tab-button>
                    <dui-tab-button>Mails</dui-tab-button>
                    <dui-tab-button>Message Bus</dui-tab-button>
                    <dui-tab-button>Logs</dui-tab-button>
                </dui-button-group>
            </div>
            @if (httpWorkflow) {
                <div
                    class="workflow"
                    style="height: 250px; margin-bottom: 10px; overflow: auto"
                    class="overlay-scrollbar-small"
                >
                    <app-workflow [workflow]="httpWorkflow">
                        @for (placeName of httpWorkflow.places; track placeName) {
                            @if (request.times['workflow/http/' + placeName]) {
                                <app-workflow-card [name]="placeName" class="valid">
                                    <div style="color: var(--dui-text-light)">
                                        {{ time(request.times['workflow/http/' + placeName]) }}
                                    </div>
                                </app-workflow-card>
                            }
                            @if (undefined === request.times['workflow/http/' + placeName]) {
                                <app-workflow-card [name]="placeName" class="invalid"> </app-workflow-card>
                            }
                        }
                    </app-workflow>
                </div>
            }
            //total db time: split in query time & serialization time //total message bus time //workflow times //event
            times //session user & storage //resolved route //request body & header //response body & header //triggered
            events //created services in DI //template render times for each render(), so we see bottlenecks easily
            //logs by levels //database queries: query time, serialization time //message bus events
            <div class="logs">Logs</div>
        }
    `,
    styles: [
        `
            :host::ng-deep .node.invalid {
                color: var(--dui-text-light);
            }

            :host::ng-deep .node.valid {
                border: 0;
            }

            :host::ng-deep .node.valid::after {
                content: '';
                position: absolute;
                left: 0;
                top: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                border: 1px solid var(--dui-color-green);
                opacity: 0.3;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [AsyncPipe, DatePipe, ButtonGroupComponent, TabButtonComponent, WorkflowComponent, WorkflowCardComponent],
})
export class HttpRequestComponent {
    public request?: EntitySubject<DebugRequest>;
    public httpWorkflow?: Workflow;

    constructor(
        protected activatedRoute: ActivatedRoute,
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
    ) {
        activatedRoute.params.subscribe(p => {
            setTimeout(() => this.loadRequest(Number(p.id)));
        });
    }

    public time(took?: number): string {
        if (took === undefined) return '-';
        if (took >= 1000) return (took / 1000).toFixed(3) + 's';
        return took.toFixed(3) + 'ms';
    }

    protected async loadRequest(id: number) {
        // const requests = await this.controllerClient.getHttpRequests();
        // this.request = requests.getEntitySubject(id);

        this.httpWorkflow = await this.controllerClient.getWorkflow('http');

        this.cd.detectChanges();
    }
}
