import { AsyncPipe, DecimalPipe, KeyValuePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Optional,
    Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { arrayRemoveItem, isArray } from '@deepkit/core';
import {
    ButtonComponent,
    ButtonGroupComponent,
    CheckboxComponent,
    DropdownComponent,
    DuiDialog,
    FormRowComponent,
    HumanFileSizePipe,
    IndicatorComponent,
    InputComponent,
    OpenDropdownDirective,
    SplitterComponent,
    TabButtonComponent,
    TabComponent,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
    TableHeaderDirective,
    TabsComponent,
    WindowToolbarComponent,
    unsubscribe,
} from '@deepkit/desktop-ui';
import { getInstanceStateFromItem } from '@deepkit/orm';
import { DatabaseInfo } from '@deepkit/orm-browser-api';
import { ClientProgress } from '@deepkit/rpc';
import {
    ReflectionClass,
    TypeProperty,
    TypePropertySignature,
    deserialize,
    getPrimaryKeyHashGenerator,
    isBackReferenceType,
    isNullable,
    isPrimaryKeyType,
    validate,
} from '@deepkit/type';

import { BrowserEntityState, BrowserQuery, BrowserState, ValidationErrors } from '../browser-state';
import { ControllerClient } from '../client';
import { BrowserCellComponent } from '../components/browser-cell.component';
import { JsonCellComponent } from '../components/cell/json-cell.component';
import { FilterComponent } from '../components/filter.compoment';
import { showTypeString } from '../utils';

@Component({
    selector: 'orm-browser-database-browser',
    templateUrl: './database-browser.component.html',
    styleUrls: ['./database-browser.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        WindowToolbarComponent,
        ButtonGroupComponent,
        ButtonComponent,
        TabsComponent,
        TabComponent,
        InputComponent,
        FormsModule,
        SplitterComponent,
        IndicatorComponent,
        TabButtonComponent,
        JsonCellComponent,
        TableComponent,
        TableColumnDirective,
        TableCellDirective,
        OpenDropdownDirective,
        DropdownComponent,
        FormRowComponent,
        FilterComponent,
        CheckboxComponent,
        BrowserCellComponent,
        AsyncPipe,
        DecimalPipe,
        KeyValuePipe,
        HumanFileSizePipe,
        TableHeaderDirective,
    ],
})
export class DatabaseBrowserComponent implements OnDestroy, OnChanges, OnInit {
    isArray = isArray;
    String = String;
    showTypeString = showTypeString;

    entityState?: BrowserEntityState;

    @Input() database!: DatabaseInfo;
    @Input() entity!: ReflectionClass<any>;

    @Input() dialog: boolean = false;

    @Input() selectedPkHashes: string[] = [];

    @Input() multiSelect: boolean = true;

    @Input() withBack: boolean = false;
    @Output() back = new EventEmitter<void>();

    @Output() select = new EventEmitter<{ items: any[]; pkHashes: string[] }>();

    protected paramsSub?: Subscription;

    protected sort: { [name: string]: any } = {};

    selectedAll: boolean = false;

    protected ignoreNextCellClick = false;

    @unsubscribe()
    routeSub?: Subscription;

    protected pkHasher: (value: any) => string = () => '';

    rowClass = (item: any) => {
        return this.state.isNew(item) ? 'new' : '';
    };

    trackByProperty(index: number, property: TypeProperty | TypePropertySignature) {
        return property.name;
    }

    async openQueryJson(query: BrowserQuery) {
        window.open(
            '//' +
                ControllerClient.getServerHost() +
                '/_orm-browser/query?dbName=' +
                encodeURIComponent(this.database.name) +
                '&entityName=' +
                encodeURIComponent(this.entity.getName()) +
                '&query=' +
                encodeURIComponent(query.javascript),
            '_blank',
        );
    }

    firstRowItem(query: BrowserQuery): ReadonlyMap<string, any> {
        return query.result[0] || {};
    }

    async executeQuery(query: BrowserQuery): Promise<void> {
        if (query.loading) return;

        query.progress = ClientProgress.track();
        query.executed = true;
        query.loading = true;
        this.cd.detectChanges();
        try {
            query.log.push('Query: ' + query.javascript);
            const start = performance.now();
            const res = await this.controllerClient.browser.query(
                this.database.name,
                this.entity.getName(),
                query.javascript,
            );
            console.log('query result', res);
            query.setValue(res.result);
            query.error = res.error;
            query.log.push(...res.log);
            query.executionTime = res.executionTime;
            query.downloadBytes = query.progress.download.total;
            query.downloadTime = performance.now() - start;
        } catch (error: any) {
            this.duiDialog.alert('Error', String(error));
        }
        query.loading = false;
        this.cd.detectChanges();
    }

    constructor(
        protected controllerClient: ControllerClient,
        public cd: ChangeDetectorRef,
        protected duiDialog: DuiDialog,
        protected host: ElementRef<HTMLElement>,
        public state: BrowserState,
        @Optional() protected activatedRoute?: ActivatedRoute,
    ) {}

    ngOnDestroy(): void {
        this.paramsSub?.unsubscribe();
    }

    ngOnInit(): void {
        if (this.database || this.entity) return;
        if (!this.activatedRoute) return;

        this.routeSub = this.activatedRoute.params.subscribe(async params => {
            this.state.databases = await this.controllerClient.getDatabases();
            this.database = this.state.database = this.state.getDatabase(decodeURIComponent(params.database));
            this.entity = this.database.getEntity(decodeURIComponent(params.entity));
            await this.loadEntity(true);
        });
    }

    async ngOnChanges(changes: any) {
        await this.loadEntity();
    }

    toggleAll(toggle: boolean) {
        if (!this.entityState) return;
        this.selectedAll = toggle;

        if (this.selectedAll) {
            this.entityState.selection = [];
        } else {
            this.entityState.selection = this.entityState.items.slice();
        }
    }

    changeSelection(row: any, select: boolean) {
        if (!this.entityState) return;

        if (select) {
            if (this.entityState.selection.includes(row)) return; //already selected
            if (!this.multiSelect) this.entityState.selection = [];
            this.entityState.selection.push(row);
        } else {
            if (!this.entityState.selection.includes(row)) return;
            arrayRemoveItem(this.entityState.selection, row);
        }
        this.selectedAll =
            this.entityState.selection.length === this.entityState.items.length && this.entityState.items.length > 0;
        this.entityState.selection = this.entityState.selection.slice();
        this.select.emit({
            items: this.entityState.selection,
            pkHashes: this.entityState.selection.map(v => this.pkHasher(v)),
        });
    }

    cellClick(event: { item: any; column: string }) {
        if (this.ignoreNextCellClick) {
            this.ignoreNextCellClick = false;
            return;
        }

        event.item.$__activeColumn = event.column;
    }

    goPage(page: number) {
        if (!this.entityState) return;

        if (page <= 0) return;
        if (page > this.entityState.totalPages) return;
        this.entityState.page = page;
        this.loadEntity(true);
    }

    onSort(event: { [name: string]: 'asc' | 'desc' }) {
        this.sort = event;
        void this.loadEntity(true);
    }

    unset = (row: any, property: TypeProperty | TypePropertySignature) => {
        this.ignoreNextCellClick = true;
        row[property.name] = isNullable(property.type) ? null : undefined;
        this.changed(row);
    };

    reset = (item: any, column: string | number | symbol) => {
        if (!this.entity) return;

        this.ignoreNextCellClick = true;
        const snapshot = getInstanceStateFromItem(item).getSnapshot();
        item[column] = deserialize(
            snapshot[column],
            undefined,
            undefined,
            undefined,
            this.entity.getProperty(column).property,
        );

        this.changed(item);
    };

    async resetAll() {
        if (!this.entityState) return;

        const a = await this.duiDialog.confirm('Reset all?', 'All changes and added data will be lost. Continue?');
        if (!a) return;

        const added = this.state.getAddedItems(this.database.name, this.entity.getName());
        for (const item of added) {
            arrayRemoveItem(this.entityState.items, item);
        }
        this.entityState.selection = [];

        this.entityState.items = this.entityState.items.slice();
        this.state.resetAll();
        await this.loadEntity(true);
    }

    async commit() {
        if (!this.database) return;

        try {
            await this.state.commit();
            await this.state.resetAll();
        } catch (error: any) {
            this.duiDialog.alert('Error saving', String(error));
            console.log(error);
        }

        await this.loadEntity(true);
    }

    changed = (row: any) => {
        if (!this.entity) return;
        if (!this.database) return;

        this.updateValidation(row);

        if (!this.state.isNew(row)) {
            //set diff
            this.state.changed(this.database.name, this.entity.getName(), row);
        }
    };

    protected updateValidation(row: any) {
        if (!this.entityState) return;

        if (this.entityState.validationStore) {
            //validation
            const errors = validate(row, this.entity.type);
            if (errors.length) {
                const validationErrors: ValidationErrors = {};
                for (const error of errors) {
                    validationErrors[error.path] = error;
                }
                this.entityState.validationStore.set(row, validationErrors);
            } else if (this.entityState.validationStore.has(row)) {
                this.entityState.validationStore.delete(row);
            }
        }
    }

    async remove() {
        if (!this.entityState) return;
        const addedItems = this.state.getAddedItems(this.database.name, this.entity.getName());

        for (const item of this.entityState.selection) {
            if (this.state.isNew(item)) {
                arrayRemoveItem(addedItems, item);
                arrayRemoveItem(this.entityState.items, item);
                this.state.disconnectForNewItem(item);
            } else {
                this.state.scheduleForDeletion(this.database.name, this.entity.getName(), item);
            }
        }
        this.entityState.selection = [];
        this.softReload();
    }

    async add() {
        if (!this.entity) return;
        if (!this.database) return;
        if (!this.entityState) return;
        const addedItems = this.state.getAddedItems(this.database.name, this.entity.getName());

        try {
            const jsonItem = await this.controllerClient.browser.create(this.database.name, this.entity.getName());
            const item: any = deserialize(jsonItem, undefined, undefined, undefined, this.entity.type);
            const state = getInstanceStateFromItem(item);
            state.markAsPersisted();
            state.markAsFromDatabase();
            this.changed(item);
            this.state.registerNewItem(item);

            this.entityState.items.splice(addedItems.length, 0, item);
            addedItems.push(item);
            this.entityState.items = this.entityState.items.slice();
            this.cd.detectChanges();
        } catch (error: any) {
            this.duiDialog.alert('Could not create item', String(error));
            console.log(error);
        }
    }

    softReload(withItems: boolean = true) {
        if (!this.entity) return;
        if (!this.database) return;
        if (!this.entityState) return;
        this.entityState.changes = this.state.getChangeStore(this.database.name, this.entity.getName());
        this.entityState.validationStore = this.state.getValidationStore(this.database.name, this.entity.getName());
        this.pkHasher = getPrimaryKeyHashGenerator(this.entity);

        this.entityState.properties = [...this.entity.getProperties()]
            .map(v => v.property)
            .filter(v => !isBackReferenceType(v.type));
        this.entityState.properties.sort((a, b) => {
            if (isPrimaryKeyType(a) && !isPrimaryKeyType(b)) return -1;
            if (!isPrimaryKeyType(a) && isPrimaryKeyType(b)) return +1;
            return 0;
        });

        this.cd.detectChanges();
        const entityName = this.entity.getName();
        this.entityState.deletions = this.state.getDeletions(this.database.name, entityName);

        if (withItems) {
            this.entityState.items = [];

            if (this.state.hasAddedItems(this.database.name, entityName)) {
                for (const item of this.state.getAddedItems(this.database.name, entityName)) {
                    this.entityState.items.push(item);
                    const pkHash = this.state.extractHashFromNewItem(item);
                    if (this.selectedPkHashes.includes(pkHash)) {
                        this.entityState.selection.push(item);
                    }
                }
            }

            for (const item of this.entityState.dbItems) {
                const state = getInstanceStateFromItem(item);
                const pkHash = state.getLastKnownPKHash();

                if (this.selectedPkHashes.includes(pkHash)) {
                    this.entityState.selection.push(item);
                }

                if (!this.entityState.deletions[pkHash]) {
                    this.entityState.items.push(item);
                }
            }
        }
    }

    async loadCount() {
        if (!this.entity) return;
        if (!this.database) return;
        if (!this.entityState) return;

        this.entityState.count = await this.controllerClient.browser.getCount(
            this.database.name,
            this.entity.getName(),
            this.getFilter(),
        );
    }

    protected getFilter(): { [name: string]: any } {
        if (!this.entityState) return {};

        const filter: { [name: string]: any }[] = [];

        for (const item of this.entityState.filter) {
            filter.push({ [item.name]: { [item.comparator]: item.value } });
        }

        return filter.length ? { $and: filter } : {};
    }

    async loadEntity(reload: boolean = false) {
        if (!this.entity) return;
        if (!this.database) return;

        this.entityState = this.state.getBrowserEntityState(this.database.name, this.entity.getName());
        if (this.dialog) {
            //reset selection, and read from selectedPkHashes in softReload
            this.entityState.selection = [];
        }

        this.entityState.error = undefined;
        this.softReload(reload === true ? false : true);

        if (!reload && this.entityState.items.length) {
            this.cd.detectChanges();
            return;
        }

        // if (this.entityState.progress) return;

        const entityName = this.entity.getName();
        const changeStore = this.entityState.changes;
        const oldChangedPkHashes = new Set(changeStore ? Object.keys(changeStore) : []);

        try {
            this.entityState.loading = true;
            this.cd.detectChanges();

            await this.loadCount();
            const start = performance.now();
            this.entityState.progress = ClientProgress.track();
            this.cd.detectChanges();

            const { items, executionTime } = await this.controllerClient.browser.getItems(
                this.database.name,
                this.entity.getName(),
                this.getFilter(),
                this.sort,
                this.entityState.itemsPerPage,
                (this.entityState.page - 1) * this.entityState.itemsPerPage,
            );
            this.entityState.executionTime = executionTime;
            this.entityState.downloadTime = performance.now() - start;
            this.entityState.downloadBytes = this.entityState.progress.download.total;
            this.entityState.loading = false;

            this.entityState.dbItems = [];
            this.entityState.items = [];
            this.entityState.selection = [];

            if (this.state.hasAddedItems(this.database.name, entityName)) {
                for (const item of this.state.getAddedItems(this.database.name, entityName)) {
                    this.entityState.items.push(item);
                    const pkHash = this.state.extractHashFromNewItem(item);
                    if (this.selectedPkHashes.includes(pkHash)) {
                        this.entityState.selection.push(item);
                    }
                }
            }

            for (const jsonItem of items) {
                const item: any = deserialize(jsonItem, undefined, undefined, undefined, this.entity.type);
                const state = getInstanceStateFromItem(item);

                state.markAsPersisted();
                state.markAsFromDatabase();
                this.updateValidation(item);
                const pkHash = state.getLastKnownPKHash();

                oldChangedPkHashes.delete(pkHash);

                if (this.selectedPkHashes.includes(pkHash)) {
                    this.entityState.selection.push(item);
                }

                if (changeStore) {
                    const changes = changeStore[pkHash];
                    if (changes && changes.changes.$set) {
                        for (const i in changes.changes.$set) {
                            if (!changes.changes.$set.hasOwnProperty(i)) continue;
                            item[i] = changes.changes.$set[i];
                        }
                    }
                }

                if (!this.entityState.deletions[pkHash]) {
                    this.entityState.items.push(item);
                }
                this.entityState.dbItems.push(item);
            }

            this.selectedAll =
                this.entityState.selection.length === this.entityState.items.length &&
                this.entityState.items.length > 0;
        } catch (error: any) {
            this.entityState.loading = false;
            this.entityState.error = String(error);
            console.log(error);
        }

        this.cd.detectChanges();
    }
}
