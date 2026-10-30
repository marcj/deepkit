import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ListItemComponent } from '@deepkit/desktop-ui';

import { BrowserState } from '../browser-state';
import { ControllerClient } from '../client';
import { trackByDatabase, trackBySchema } from '../utils';

@Component({
    selector: 'orm-browser-list',
    template: `
        @for (db of state.databases; track trackByDatabase(i, db); let i = $index) {
            <dui-list-item
                [routerLink]="['/database', encodeURIComponent(db.name)]"
                [routerLinkActiveOptions]="{ exact: true }"
                >{{ db.name }} ({{ db.adapter }})</dui-list-item
            >
            @for (entity of db.getClassSchemas(); track trackBySchema($index, entity)) {
                <dui-list-item
                    [routerLink]="['/database', encodeURIComponent(db.name), encodeURIComponent(entity.getName())]"
                >
                    <div class="item">
                        <div>{{ entity.getClassName() }}</div>
                        @if (state.hasAddedItems(db.name, entity.getName()); as items) {
                            <div class="add">({{ state.getAddedItems(db.name, entity.getName()).length }})</div>
                        }
                        <div class="count">{{ counts[state.getStoreKey(db.name, entity.getName())] || 0 }}</div>
                    </div>
                </dui-list-item>
            }
        }
    `,
    styles: [
        `
            .item {
                margin-left: 15px;
                display: flex;
            }

            .item .add {
                margin-left: 5px;
                color: var(--dui-color-orange);
            }

            .item .count {
                margin-left: auto;
                color: var(--dui-text-light);
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ListItemComponent, RouterLink],
})
export class DatabaseBrowserListComponent implements OnInit {
    encodeURIComponent = encodeURIComponent;
    public counts: { [storeKey: string]: number } = {};
    trackBySchema = trackBySchema;
    trackByDatabase = trackByDatabase;

    constructor(
        public state: BrowserState,
        protected cd: ChangeDetectorRef,
        protected controllerClient: ControllerClient,
    ) {}

    async ngOnInit() {
        this.state.databases = await this.controllerClient.getDatabases();
        this.state.onDataChange.subscribe(this.loadCounts.bind(this));
        await this.loadCounts();
    }

    protected async loadCounts() {
        const promises: Promise<any>[] = [];
        for (const db of this.state.databases) {
            for (const entity of db.getClassSchemas()) {
                const key = this.state.getStoreKey(db.name, entity.getName());
                promises.push(
                    this.controllerClient.browser.getCount(db.name, entity.getName(), {}).then(
                        count => {
                            this.counts[key] = count;
                        },
                        err => console.log('loading count error', entity.getName(), err),
                    ),
                );
            }
        }

        await Promise.all(promises);
        this.cd.detectChanges();
    }
}
