/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent, TableCellDirective, TableColumnDirective, TableComponent } from '@deepkit/desktop-ui';
import { RpcAction, Workflow } from '@deepkit/framework-debug-api';

import { ControllerClient } from '../../client';

@Component({
    template: `
        <!--<div class="header">
      <h4>RPC Workflow</h4>
    </div>
    <div style="height: 250px; margin-bottom: 10px; overflow: auto" class="overlay-scrollbar-small">
      <app-workflow [workflow]="workflow"></app-workflow>
    </div>-->
        <div class="header">
            <h4>RPC Actions</h4>
            <dui-input placeholder="Filter" round semiTransparent lightFocus [(ngModel)]="filterQuery"></dui-input>
        </div>
        <dui-table
            style="flex: 1 1"
            [items]="filter(actions, filterQuery)"
            [(selected)]="selected"
            selectable
            defaultSort="path"
            no-focus-outline
        >
            <dui-table-column [width]="220" name="controller"></dui-table-column>
            <dui-table-column [width]="220" name="path"></dui-table-column>
            <dui-table-column [width]="220" name="methodName"></dui-table-column>
            <dui-table-column [width]="220" name="parameters">
                <ng-container *duiTableCell="let row">
                    {{ getParameters(row) }}
                </ng-container>
            </dui-table-column>
        </dui-table>
    `,
    styles: [
        `
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            .header {
                display: flex;
                margin-bottom: 15px;
            }

            .header dui-input {
                margin-left: auto;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [InputComponent, TableComponent, TableColumnDirective, FormsModule, TableCellDirective],
})
export class RpcComponent implements OnInit {
    public actions: RpcAction[] = [];
    public selected: RpcAction[] = [];
    public workflow?: Workflow;

    public filterQuery: string = '';

    constructor(
        private controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
    ) {}

    get route() {
        return this.selected[0];
    }

    getParameters(action: RpcAction): string {
        return action.parameters.map(p => p.type).join(', ');
    }

    filter(items: RpcAction[], filter: string): any[] {
        if (!filter) return items;

        return items.filter(
            v => v.path.includes(filter) || v.controller.includes(filter) || v.methodName.includes(filter),
        );
    }

    async ngOnInit(): Promise<void> {
        [this.actions] = await Promise.all([
            this.controllerClient.debug.actions(),
            // this.controllerClient.debug.getWorkflow('rpc'),
        ]);
        this.cd.detectChanges();
    }
}
