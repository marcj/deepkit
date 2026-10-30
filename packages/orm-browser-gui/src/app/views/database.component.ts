import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, Optional } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { empty } from '@deepkit/core';
import { ButtonComponent, ButtonGroupComponent, DuiDialog, TabButtonComponent, unsubscribe } from '@deepkit/desktop-ui';
import { DatabaseInfo } from '@deepkit/orm-browser-api';

import { BrowserState } from '../browser-state';
import { ControllerClient } from '../client';
import { DatabaseGraphComponent } from '../components/database-graph.component';

@Component({
    selector: 'orm-browser-database',
    template: `
        <div class="header">
            <dui-button-group>
                <dui-tab-button [active]="tab === 'model'" (click)="setTab('model')">Model</dui-tab-button>
                <dui-tab-button [active]="tab === 'migration'" (click)="setTab('migration')">Migration </dui-tab-button>
            </dui-button-group>
        </div>

        <div class="layout" [hidden]="tab !== 'model'">
            @if (database) {
                <database-graph [database]="database"></database-graph>
            }
        </div>

        <div class="layout migration-container" [hidden]="tab !== 'migration'">
            @if (database) {
                @if (loadingMigrations) {
                    <div>Load migration</div>
                }
                @if (!loadingMigrations) {
                    <div>
                        <dui-button (click)="resetAll()">Reset all</dui-button>
                        <dui-button (click)="migrate()">Migrate all</dui-button>
                        @if (empty(migrations)) {
                            <div class="migrations">
                                No migrations available. Your models are in sync with the database schema.
                            </div>
                        }
                        @if (!empty(migrations)) {
                            <div class="migrations">
                                @for (kv of migrations | keyvalue; track kv) {
                                    <div>
                                        <h3>{{ kv.key }}</h3>
                                        <div class="diff text-selection">{{ kv.value.diff }}</div>
                                        @for (sql of kv.value.sql; track sql) {
                                            <div class="sql text-selection">
                                                {{ sql }}
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            }
        </div>
    `,
    styleUrls: ['./database.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        ButtonGroupComponent,
        TabButtonComponent,
        DatabaseGraphComponent,
        ButtonComponent,
        KeyValuePipe,
    ],
})
export class DatabaseComponent implements OnDestroy {
    tab: string = 'model';
    empty = empty;

    migrations: { [name: string]: { sql: string[]; diff: string } } = {};

    loadingMigrations: boolean = false;

    @Input() database!: DatabaseInfo;

    @unsubscribe()
    routeSub?: Subscription;

    constructor(
        protected controllerClient: ControllerClient,
        protected cd: ChangeDetectorRef,
        protected duiDialog: DuiDialog,
        public state: BrowserState,
        @Optional() protected activatedRoute?: ActivatedRoute,
    ) {
        if (activatedRoute) {
            this.routeSub = activatedRoute.params.subscribe(async params => {
                this.state.databases = await this.controllerClient.getDatabases();
                this.database = this.state.getDatabase(decodeURIComponent(params.database));
                this.cd.detectChanges();
            });
        }
    }

    ngOnDestroy(): void {}

    async setTab(tab: string) {
        this.tab = tab;
        if (tab === 'migration') {
            await this.loadMigration();
        }
    }

    async resetAll() {
        if (!this.database) return;
        if (!(await this.duiDialog.confirm('Reset all?', 'All database tables will be reset. All content deleted.')))
            return;

        try {
            await this.controllerClient.browser.resetAllTables(this.database.name);
        } catch (error: any) {
            await this.duiDialog.alert('Error resetting all', String(error));
        }
        await this.loadMigration();
        this.state.onDataChange.emit();
    }

    async migrate() {
        if (!this.database) return;

        try {
            await this.controllerClient.browser.migrate(this.database.name);
        } catch (error: any) {
            await this.duiDialog.alert('Error migrating', String(error));
        }
        await this.loadMigration();
        this.state.onDataChange.emit();
    }

    async loadMigration() {
        this.loadingMigrations = true;
        this.cd.detectChanges();
        try {
            this.migrations = await this.controllerClient.browser.getMigrations(this.database.name);
        } finally {
            this.loadingMigrations = false;
            this.cd.detectChanges();
        }
    }
}
