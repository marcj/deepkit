/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InputComponent, TableColumnDirective, TableComponent } from '@deepkit/desktop-ui';
import { ConfigOption } from '@deepkit/framework-debug-api';

import { ControllerClient } from '../../client';
import { Lifecycle } from '../../utils';

@Component({
    template: `
        <div class="section">
            <div class="header">
                <h4>Application configuration</h4>
                <dui-input
                    placeholder="Filter"
                    round
                    semiTransparent
                    lightFocus
                    [(ngModel)]="applicationConfigFilter"
                ></dui-input>
            </div>
            <p>Application config values from your root application module.</p>
            <dui-table [items]="filter(applicationConfig, applicationConfigFilter)" defaultSort="name" no-focus-outline>
                <dui-table-column class="text-selection" name="name"></dui-table-column>
                <dui-table-column class="text-selection" name="value"></dui-table-column>
                <dui-table-column class="text-selection" name="defaultValue"></dui-table-column>
                <dui-table-column class="text-selection" name="type"></dui-table-column>
                <dui-table-column class="text-selection" name="description"></dui-table-column>
            </dui-table>
        </div>

        <div class="section">
            <div class="header">
                <h4>Module configuration</h4>
                <dui-input placeholder="Filter" round semiTransparent lightFocus [(ngModel)]="configFilter"></dui-input>
            </div>
            <p>Config values from core modules and your imported modules.</p>
            <dui-table [items]="filter(config, configFilter)" defaultSort="name" no-focus-outline>
                <dui-table-column class="text-selection" [width]="220" name="name"></dui-table-column>
                <dui-table-column class="text-selection" name="value"></dui-table-column>
                <dui-table-column class="text-selection" name="defaultValue"></dui-table-column>
                <dui-table-column class="text-selection" name="type"></dui-table-column>
                <dui-table-column class="text-selection" name="description"></dui-table-column>
            </dui-table>
        </div>
    `,
    styles: [
        `
            :host {
                display: flex;
                height: 100%;
                max-width: 100%;
            }

            .section {
                flex: 1 1 auto;
                height: 100%;
                display: flex;
                margin: 5px;
                flex-direction: column;
                overflow: hidden;
            }

            .header {
                display: flex;
            }

            .header dui-input {
                margin-left: auto;
            }

            .section h4 {
                margin-bottom: 10px;
            }

            dui-table {
                flex: 1;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [InputComponent, FormsModule, TableComponent, TableColumnDirective],
})
export class ConfigurationComponent implements OnInit, OnDestroy {
    public applicationConfigFilter: string = '';
    public configFilter: string = '';

    public applicationConfig: ConfigOption[] = [];
    public config: ConfigOption[] = [];
    lifecycle = new Lifecycle();

    constructor(
        private client: ControllerClient,
        public cd: ChangeDetectorRef,
    ) {
        this.lifecycle.add(client.client.transporter.reconnected.subscribe(() => this.load()));
    }

    filter(items: ConfigOption[], filter: string): any[] {
        if (!filter) return items;

        return items.filter(v => v.name.includes(filter));
    }

    ngOnDestroy() {
        this.lifecycle.destroy();
    }

    async ngOnInit(): Promise<void> {
        await this.load();
    }

    async load() {
        const configuration = await this.client.debug.configuration();

        this.applicationConfig = configuration.appConfig;
        this.config = configuration.modulesConfig;

        this.cd.detectChanges();
    }
}
