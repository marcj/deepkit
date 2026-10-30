/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { NgTemplateOutlet, formatDate } from '@angular/common';
import {
    AfterViewInit,
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    Directive,
    ElementRef,
    HostBinding,
    HostListener,
    LOCALE_ID,
    OnDestroy,
    OnInit,
    TemplateRef,
    booleanAttribute,
    computed,
    contentChild,
    contentChildren,
    effect,
    inject,
    input,
    model,
    numberAttribute,
    output,
    signal,
    viewChild,
    viewChildren,
} from '@angular/core';

import { arrayHasItem, arrayRemoveItem, empty, first, getPathValue, indexOf, nextTick } from '@deepkit/core';

import { findParentWithClass } from '../../core/utils';
import { DragDirective, DuiDragEvent, DuiDragStartEvent } from '../app/drag';
import { RegisterEventListenerRemove, injectElementRef, registerEventListener } from '../app/utils';
import {
    ContextDropdownDirective,
    DropdownComponent,
    DropdownComponent as DropdownComponent_1,
    DropdownContainerDirective,
    DropdownItemComponent,
    DropdownSplitterComponent,
} from '../button/dropdown.component';
import { IconComponent } from '../icon/icon.component';
import { SplitterComponent } from '../splitter/splitter.component';

/**
 * Directive to allow dynamic content in a cell.
 *
 * ```html
 * <dui-table-column>
 *     <ng-container *duiTableCell="let item">
 *          {{item.fieldName | date}}
 *     </ng-container>
 * </dui-table-column>
 * ```
 */
@Directive({ selector: '[duiTableCell]' })
export class TableCellDirective {
    constructor(public template: TemplateRef<any>) {}
}

/**
 * Can be used to define own dropdown items once the user opens the header context menu.
 *
 * ```html
 * <dui-table>
 *   <dui-dropdown duiTableCustomHeaderContextMenu>
 *       <dui-dropdown-item>Custom Item</dui-dropdown-item>
 *   </dui-dropdown>
 * </dui-table>
 */
@Directive({ selector: 'dui-dropdown[duiTableCustomHeaderContextMenu]' })
export class TableCustomHeaderContextMenuDirective {
    constructor(public dropdown: DropdownComponent) {}
}

/**
 * Can be used to define own dropdown items once the user opens the row context menu.
 *
 * ```html
 * <dui-table>
 *    <dui-dropdown duiTableCustomRowContextMenu>
 *       <dui-dropdown-item>Custom Item</dui-dropdown-item>
 *    </dui-dropdown>
 * </dui-table>
 * ```
 */
@Directive({ selector: 'dui-dropdown[duiTableCustomRowContextMenu]' })
export class TableCustomRowContextMenuDirective {
    constructor(public dropdown: DropdownComponent) {}
}

/**
 * Directive to allow dynamic content in a column header.
 *
 * ```html
 * <dui-table-column name="fieldName">
 *     <ng-container *duiTableHead>
 *          <strong>Header</strong>
 *     </ng-container>
 * </dui-table-column>
 * ```
 */
@Directive({ selector: '[duiTableHeader]' })
export class TableHeaderDirective {
    constructor(public template: TemplateRef<any>) {}
}

/**
 * Defines a new column.
 *
 * ```html
 * <dui-table-column name="fieldName" header="Field Name" [width]="100" />
 */
@Directive({ selector: 'dui-table-column' })
export class TableColumnDirective implements OnInit {
    /**
     * The name of the column. Needs to be unique. If no renderer (*duiTableCell) is specified, this
     * name is used to render the content T[name].
     *
     * This supports dot notation, so you can use `user.name` to access the `name` property of the `user` object.
     */
    name = input<string>('');

    /**
     * A different header name. Use dui-table-header to render HTML there.
     */
    header = input<string>();

    /**
     * Default width.
     */
    width = input(100, { transform: numberAttribute });

    effectiveWidth = model(0);

    /**
     * Adds additional class to the columns cells.
     */
    class = input<string>('');

    /**
     * Whether this column is start hidden. User can unhide it using the context menu on the header.
     */
    hidden = input(false, { transform: booleanAttribute });

    effectiveHidden = model<boolean | undefined>(false);

    sortable = input<boolean>(true);

    hideable = input<boolean>(true);

    /**
     * At which position this column will be placed.
     */
    position = input<number>();

    /**
     * This is the new position when the user moved it manually.
     * @hidden
     */
    effectivePosition = signal<number | undefined>(undefined);

    cell = contentChild(TableCellDirective, {});
    headerDirective = contentChild(TableHeaderDirective, {});

    ngOnInit() {}

    getHidden(): boolean {
        return this.effectiveHidden() ?? this.hidden();
    }

    toggleHidden() {
        this.effectiveHidden.update(v => !this.getHidden());
    }

    /**
     * @hidden
     */
    getWidth(): number {
        return this.effectiveWidth() || this.width() || 0;
    }

    /**
     * @hidden
     */
    getPosition() {
        const overwritten = this.effectivePosition();
        if (overwritten !== undefined) return overwritten;
        return this.position();
    }
}

interface THBox {
    left: number;
    width: number;
    element: HTMLElement;
    directive: TableColumnDirective;
}

@Component({
    selector: 'dui-table',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <dui-dropdown #headerDropdown>
            <ng-container *dropdownContainer>
                @for (column of sortedColumns(); track column.name()) {
                    @if (column.hideable() && column.name()) {
                        <dui-dropdown-item
                            [selected]="!column.getHidden()"
                            (click)="column.toggleHidden(); headerDropdown.close()"
                        >
                            @if (column.headerDirective(); as header) {
                                <ng-container
                                    [ngTemplateOutlet]="header.template"
                                    [ngTemplateOutletContext]="{ $implicit: column }"
                                ></ng-container>
                            } @else {
                                {{ column.header() || column.name() }}
                            }
                        </dui-dropdown-item>
                    }
                }
                <dui-dropdown-separator></dui-dropdown-separator>
                <dui-dropdown-item (click)="resetAll()">Reset all</dui-dropdown-item>
            </ng-container>
        </dui-dropdown>

        @if (showHeader()) {
            <div class="header" #header [contextDropdown]="customHeaderDropdown()?.dropdown || headerDropdown">
                @for (column of sortedFilteredColumns(); track $index; let columnIndex = $index) {
                    <div
                        class="th"
                        [style.width.px]="column.getWidth()"
                        (click)="sortBy(column.name() || '', $event)"
                        [class.freeze]="columnIndex < freezeColumns()"
                        [style.left.px]="columnIndex < freezeColumns() ? freezeLeft(columnIndex) : undefined"
                        [attr.name]="column.name()"
                        (duiDrag)="onHeadDrag($event)"
                        (duiDragStart)="onHeadDragStart($event, $index)"
                        (duiDragEnd)="onHeadDragEnd($event)"
                        #th
                    >
                        @if (column.headerDirective(); as header) {
                            <ng-container
                                [ngTemplateOutlet]="header.template"
                                [ngTemplateOutletContext]="{ $implicit: column }"
                            ></ng-container>
                        } @else {
                            {{ column.header() || column.name() }}
                        }
                        @if (sort()[column.name()]; as direction) {
                            @if (direction === 'desc') {
                                <dui-icon [size]="12" name="arrow_down"></dui-icon>
                            } @else {
                                <dui-icon [size]="12" name="arrow_up"></dui-icon>
                            }
                        }
                        <dui-splitter
                            [size]="column.getWidth()"
                            (sizeChange)="column.effectiveWidth.set($event)"
                            indicator
                            position="right"
                        ></dui-splitter>
                    </div>
                }
            </div>
        }
        @let valueFetch = valueFetcher();

        @let selectedSet$ = selectedSet();
        @let contextDropdown = $safeNavigationMigration(customRowDropdown()?.dropdown);
        @let freezeColumns$ = freezeColumns();

        <div
            class="body"
            [class.overlay-scrollbar-small]="!virtualScrolling()"
            #body
            (click)="clickCell($event)"
            (dblclick)="dblClickCell($event)"
        >
            @if (!virtualScrolling()) {
                @for (row of filterSorted(); track trackByFn(i, row); let i = $index; let isOdd = $odd) {
                    <div
                        class="table-row {{ rowClass()(row) }}"
                        [contextDropdown]="contextDropdown"
                        [class.selected]="selectedSet$.has(row)"
                        [class.odd]="isOdd"
                        (click)="select(row, $event)"
                        (contextmenu)="select(row, $event)"
                        (dblclick)="rowDblClick.emit(row)"
                    >
                        @for (column of sortedFilteredColumns(); track $index; let columnIndex = $index) {
                            <div
                                class="table-cell"
                                [class]="column.class() + ' ' + cellClass()(row, column.name())"
                                [attr.row-column]="column.name()"
                                [class.freeze]="columnIndex < freezeColumns$"
                                [style.left.px]="columnIndex < freezeColumns$ ? freezeLeft(columnIndex) : undefined"
                                [class.freeze-last]="columnIndex === freezeColumns$ - 1"
                                [attr.row-i]="i"
                                [style.flex-basis.px]="column.getWidth()"
                            >
                                @if (column.cell(); as cell) {
                                    <ng-container
                                        [ngTemplateOutlet]="cell.template"
                                        [ngTemplateOutletContext]="{ $implicit: row }"
                                    ></ng-container>
                                } @else {
                                    {{ valueFetch(row, column.name()) }}
                                }
                            </div>
                        }
                    </div>
                }
            } @else {
                <cdk-virtual-scroll-viewport #viewportElement class="overlay-scrollbar-small" [itemSize]="itemHeight()">
                    <ng-container
                        *cdkVirtualFor="let row of filterSorted(); trackBy: trackByFn; let i = index; odd as isOdd"
                    >
                        <div
                            class="table-row {{ rowClass()(row) }}"
                            [contextDropdown]="contextDropdown"
                            [class.selected]="selectedSet$.has(row)"
                            [class.odd]="isOdd"
                            [style.height.px]="itemHeight()"
                            (click)="select(row, $event)"
                            (contextmenu)="select(row, $event)"
                            (dblclick)="rowDblClick.emit(row)"
                        >
                            @for (column of sortedFilteredColumns(); track $index; let columnIndex = $index) {
                                <div
                                    class="table-cell"
                                    [class]="column.class() + ' ' + cellClass()(row, column.name())"
                                    [attr.row-column]="column.name()"
                                    [class.freeze]="columnIndex < freezeColumns$"
                                    [style.left.px]="columnIndex < freezeColumns$ ? freezeLeft(columnIndex) : undefined"
                                    [class.freeze-last]="columnIndex === freezeColumns$ - 1"
                                    [attr.row-i]="i"
                                    [style.flex-basis.px]="column.getWidth()"
                                >
                                    @if (column.cell(); as cell) {
                                        <ng-container
                                            [ngTemplateOutlet]="cell.template"
                                            [ngTemplateOutletContext]="{ $implicit: row }"
                                        ></ng-container>
                                    } @else {
                                        {{ valueFetch(row, column.name()) }}
                                    }
                                </div>
                            }
                        </div>
                    </ng-container>
                </cdk-virtual-scroll-viewport>
            }
        </div>
    `,
    styleUrls: ['./table.component.scss'],
    host: {
        '[class.focus-outline]': '!noFocusOutline()',
        '[class.borderless]': 'borderless()',
        '[class.with-hover]': 'hover()',
        '[class.no-virtual-scrolling]': '!virtualScrolling()',
        '[class.dui-normalized]': 'true',
        '[class.text-selection]': 'textSelection()',
    },
    imports: [
        DropdownComponent_1,
        DropdownContainerDirective,
        DropdownItemComponent,
        NgTemplateOutlet,
        DropdownSplitterComponent,
        ContextDropdownDirective,
        IconComponent,
        SplitterComponent,
        CdkVirtualScrollViewport,
        CdkFixedSizeVirtualScroll,
        CdkVirtualForOf,
        DragDirective,
    ],
})
export class TableComponent<T> implements AfterViewInit, OnInit, OnDestroy {
    protected app = inject(ApplicationRef);
    protected locale = inject(LOCALE_ID);

    /**
     * @hidden
     */
    @HostBinding() tabindex = 0;

    borderless = input(false, { transform: booleanAttribute });

    /**
     * Array of items that should be used for each row.
     */
    items = input.required<T[]>();

    /**
     * Since dui-table has virtual-scroll active per default, it's required to define the itemHeight to
     * make scrolling actually workable correctly.
     */
    itemHeight = input<number>(25);

    /**
     * Whether the table height just prints all rows, or if virtual scrolling is enabled.
     * If true, the row height depends on the content.
     */
    virtualScrolling = input<boolean>(true);

    /**
     * Whether the table row should have a hover effect.
     */
    hover = input(false, { transform: booleanAttribute });

    /**
     * Whether the header should be shown.
     */
    showHeader = input<boolean>(true);

    /**
     * How many columns (from the left) are frozen (stay visible even if user scrolls horizontally).
     */
    freezeColumns = input<number>(0);

    /**
     * Default field of T for sorting.
     */
    defaultSort = input<string>('');

    /**
     * Default sorting order.
     */
    defaultSortDirection = input<'asc' | 'desc'>('asc');

    /**
     * Whether rows are selectable.
     */
    selectable = input(false, { transform: booleanAttribute });

    /**
     * Whether multiple rows are selectable at the same time.
     */
    multiSelect = input(false, { alias: 'multi-select', transform: booleanAttribute });

    /**
     * TrackFn for ngFor to improve performance. Default is order by index.
     */
    trackFn = input<(index: number, item: T) => any>();

    /**
     * Filter function.
     */
    filter = input<(item: T) => boolean>();

    rowClass = input<(item: T) => string>(() => '');

    cellClass = input<(item: T, column: string) => string>(() => '');

    /**
     * When the user changes the order or width of the columns, the information is stored
     * in localStorage using this key, prefixed with `@dui/table/`.
     */
    preferenceKey = input<string>('root');

    /**
     * Filter query.
     */
    filterQuery = input<string>();

    /**
     * Against which fields filterQuery should run.
     */
    filterFields = input<string[]>();

    /**
     * Alternate object value fetcher, important for sorting and filtering.
     */
    valueFetcher = input((object: any, path: string): any => {
        if (!path) return '';
        const value = getPathValue(object, path);
        if (value instanceof Date) {
            return formatDate(value, 'yyyy-MM-dd HH:mm:ss', this.locale);
        }
        return value;
    });

    /**
     * A hook to provide custom sorting behavior for certain columns.
     */
    sortFunction = input<(sort: { [name: string]: 'asc' | 'desc' }) => ((a: T, b: T) => number) | undefined>();

    /**
     * Whether sorting is enabled (clicking headers trigger sort).
     */
    sorting = input<boolean>(true);

    noFocusOutline = input(false, { alias: 'no-focus-outline', transform: booleanAttribute });

    /**
     * Allow text selection in the table.
     */
    textSelection = input(false, { alias: 'text-selection', transform: booleanAttribute });

    sort = model<{ [column: string]: 'asc' | 'desc' }>({});

    sorted = computed(() => {
        const sortFunction = this.sortFunction();
        if (sortFunction) {
            const sorted = this.items().sort(sortFunction(this.sort()));
            return sorted.slice();
        }

        const sort = Object.entries(this.sort());
        sort.reverse(); //we start from bottom
        let sortRoot = (a: any, b: any) => 0;
        for (const [name, dir] of sort) {
            sortRoot = this.createSortFunction(name, dir, sortRoot);
        }
        const sorted = this.items().sort(sortRoot);
        return sorted.slice();
    });

    protected selectedSet = computed<Set<T>>(() => new Set(this.selected()));

    /**
     * Elements that are selected, by reference.
     */
    selected = model<T[]>([]);

    cellSelect = output<{ item: T; cell: string } | undefined>();

    /**
     * When a row gets double-clicked.
     */
    rowDblClick = output<T>();

    cellClick = output<{ item: T; column: string }>();
    cellDblClick = output<{ item: T; column: string }>();

    protected header = viewChild('header', { read: ElementRef });
    protected ths = viewChildren('th', { read: ElementRef });

    columnDefs = contentChildren(TableColumnDirective, { descendants: true });

    protected customHeaderDropdown = contentChild(TableCustomHeaderContextMenuDirective);
    protected customRowDropdown = contentChild(TableCustomRowContextMenuDirective);

    protected viewport = viewChild(CdkVirtualScrollViewport);
    protected viewportElement = viewChild('viewportElement', { read: ElementRef<HTMLElement> });
    protected body = viewChild('body', { read: ElementRef<HTMLElement> });

    sortedColumns = computed(() => {
        const originalDefs = this.columnDefs();
        const columns = originalDefs.slice();

        columns.sort((a, b) => {
            const aPosition = a.getPosition() === undefined ? originalDefs.indexOf(a) : a.getPosition()!;
            const bPosition = b.getPosition() === undefined ? originalDefs.indexOf(b) : b.getPosition()!;

            if (aPosition > bPosition) return 1;
            if (aPosition < bPosition) return -1;

            return 0;
        });
        return columns;
    });

    sortedFilteredColumns = computed(() => {
        const originalDefs = this.sortedColumns();
        return originalDefs.filter(v => !v.getHidden());
    });

    protected storedPreferences = computed(() => {
        if ('undefined' === typeof localStorage) return {};
        const preferencesJSON = localStorage.getItem('@dui/table/preferences-' + this.preferenceKey());
        if (!preferencesJSON) return {};
        try {
            return JSON.parse(preferencesJSON);
        } catch (error) {
            console.error('Error parsing table preferences:', error);
            return {};
        }
    });

    protected columnMap = computed(() => {
        const map: { [name: string]: TableColumnDirective } = {};
        for (const column of this.sortedColumns()) {
            map[column.name()] = column;
        }
        return map;
    });

    protected ignoreThisSort = false;

    element = injectElementRef();

    constructor() {
        effect(() => this.loadPreference());
        effect(() => this.storePreference());
        effect(() => {
            const items = this.filterSorted();
            this.viewport()?.checkViewportSize();
        });
    }

    ngOnInit() {
        const defaultSort = this.defaultSort();
        if (defaultSort) {
            this.sort()[defaultSort] = this.defaultSortDirection();
        }
    }

    ngOnDestroy(): void {
        this.removeScrollListener?.();
    }

    protected freezeLeft(untilIndex: number): number {
        const columns = this.sortedColumns();
        let left = 0;
        for (let i = 0; i < untilIndex; i++) {
            left += columns[i].getWidth();
        }
        return left;
    }

    @HostListener('window:resize')
    protected onResize() {
        nextTick(() => {
            this.viewport()?.checkViewportSize();
        });
    }

    protected resetAll() {
        localStorage.removeItem('@dui/table/preferences-' + this.preferenceKey());
        for (const column of this.columnDefs()) {
            column.effectiveWidth.set(0);
            column.effectiveHidden.set(undefined);
            column.effectivePosition.set(undefined);
        }
    }

    protected preferenceLoaded = signal(false);

    protected storePreference() {
        if (!this.preferenceLoaded()) return;
        if ('undefined' === typeof localStorage) return;
        const preferences: { [name: string]: { hidden: boolean | ''; width?: number | string; order?: number } } = {};
        for (const column of this.columnDefs()) {
            preferences[column.name()] = {
                width: column.getWidth(),
                order: column.getPosition(),
                hidden: column.getHidden(),
            };
        }
        localStorage.setItem('@dui/table/preferences-' + this.preferenceKey(), JSON.stringify(preferences));
    }

    protected loadPreference() {
        if ('undefined' === typeof localStorage) return;
        if (this.preferenceLoaded()) return;
        this.preferenceLoaded.set(true);
        const preferences = this.storedPreferences();
        if (!preferences) return;
        const columnMap = this.columnMap();
        for (const [i, v] of Object.entries(columnMap)) {
            if (!columnMap[i]) continue;
            if (!preferences[i]) continue;
            if (preferences[i].width !== undefined) v.effectiveWidth.set(preferences[i].width);
            if (preferences[i].order !== undefined) v.effectivePosition.set(preferences[i].order);
            if (preferences[i].hidden !== undefined) v.effectiveHidden.set(preferences[i].hidden);
        }
    }

    protected dblClickCell(event: MouseEvent) {
        if (!event.target) return;
        const cell = findParentWithClass(event.target as HTMLElement, 'table-cell');
        if (!cell) return;
        const i = parseInt(cell.getAttribute('row-i') || '', 10);
        const column = cell.getAttribute('row-column') || '';

        this.cellDblClick.emit({ item: this.sorted()[i], column });
    }

    protected clickCell(event: MouseEvent) {
        if (!event.target) return;
        const cell = findParentWithClass(event.target as HTMLElement, 'table-cell');
        if (!cell) return;
        const i = parseInt(cell.getAttribute('row-i') || '', 10);
        const column = cell.getAttribute('row-column') || '';

        this.cellClick.emit({ item: this.sorted()[i], column });
    }

    /**
     * Toggles the sort by the given column name.
     */
    protected sortBy(name: string, $event?: MouseEvent) {
        if (!this.sorting()) return;

        if (this.ignoreThisSort) {
            this.ignoreThisSort = false;
            return;
        }

        const column = this.columnMap()[name];
        if (!column?.sortable()) {
            return;
        }

        const sort = this.sort();

        //only when shift is pressed do we activate multi-column sort
        if (!$event || !$event.shiftKey) {
            for (const member in this.sort()) if (member !== name) delete sort[member];
        }

        if (!sort[name]) {
            sort[name] = 'asc';
        } else {
            if (sort[name] === 'asc') sort[name] = 'desc';
            else if (sort[name] === 'desc') delete sort[name];
        }

        this.sort.set({ ...sort });
    }

    filterSorted = computed(() => {
        if (this.filter() || (this.filterQuery() && this.filterFields())) {
            return this.sorted().filter(v => this.filterFn(v));
        }

        return this.sorted();
    });

    /**
     * @hidden
     */
    protected trackByFn = (index: number, item: any) => {
        const trackFn = this.trackFn();
        return trackFn ? trackFn(index, item) : index;
    };

    protected headMoveThBoxes: THBox[] = [];
    protected removeScrollListener?: RegisterEventListenerRemove;

    protected headMove: {
        element?: HTMLElement;
        foundBox?: THBox;
        originalPosition: number;
        startOffsetLeft: number;
        offsetLeft: number;
        startOffsetWidth: number;
        elementCells: HTMLElement[];
        rowCells: HTMLElement[][];
    } = {
        foundBox: undefined,
        element: undefined,
        originalPosition: -1,
        startOffsetLeft: 0,
        offsetLeft: 0,
        startOffsetWidth: 0,
        elementCells: [],
        rowCells: [],
    };

    onHeadDragStart(event: DuiDragStartEvent, index: number) {
        const ths = this.ths();
        const element = (this.headMove.element = ths[index]?.nativeElement);
        if (!this.headMove.element) {
            event.accept = false;
            return;
        }

        // element = event.target as HTMLElement;
        element.style.zIndex = '1000000';
        element.style.opacity = '0.8';

        this.headMove.startOffsetLeft = element.offsetLeft;
        this.headMove.offsetLeft = element.offsetLeft;
        this.headMove.startOffsetWidth = element.offsetWidth;

        this.headMoveThBoxes.length = 0;
        this.headMove.rowCells.length = 0;

        const sortedColumns = this.sortedColumns();
        for (const th of this.ths()) {
            const attributeName = th.nativeElement.getAttribute('name') || '';
            const directive = sortedColumns.find(v => v.name() === attributeName);
            if (!directive) continue;
            const cells = [
                ...this.element.nativeElement.querySelectorAll('div[row-column="' + directive.name() + '"]'),
            ] as any as HTMLElement[];

            if (th.nativeElement === element) {
                this.headMove.originalPosition = sortedColumns.indexOf(directive);
                this.headMove.elementCells = cells;
                for (const cell of cells) {
                    cell.classList.add('active-drop');
                }
            } else {
                for (const cell of cells) {
                    cell.classList.add('other-cell');
                }
                th.nativeElement.classList.add('other-cell');
            }

            this.headMoveThBoxes.push({
                left: th.nativeElement.offsetLeft,
                width: th.nativeElement.offsetWidth,
                element: th.nativeElement,
                directive: directive,
            });

            this.headMove.rowCells.push(cells);
        }
    }

    onHeadDrag(event: DuiDragEvent) {
        const element = this.headMove.element;
        if (!element) return;
        const THsBoxes = this.headMoveThBoxes;
        const rowCells = this.headMove.rowCells;
        const startOffsetLeft = this.headMove.startOffsetLeft;
        const startOffsetWidth = this.headMove.startOffsetWidth;
        const elementCells = this.headMove.elementCells;

        element.style.left = event.deltaX + 'px';
        const offsetLeft = startOffsetLeft + event.deltaX;

        for (const cell of elementCells) {
            cell.style.left = event.deltaX + 'px';
        }
        let afterElement = false;

        let foundBox = undefined;
        for (let i = 0; i < THsBoxes.length; i++) {
            const box = THsBoxes[i];
            if (box.element === element) {
                afterElement = true;
                continue;
            }

            box.element.style.left = '0px';
            for (const cell of rowCells[i]) {
                cell.style.left = '0px';
            }

            if (!afterElement && box.left + box.width / 2 > offsetLeft) {
                //the dragged element is before the current
                box.element.style.left = startOffsetWidth + 'px';

                for (const cell of rowCells[i]) {
                    cell.style.left = startOffsetWidth + 'px';
                }

                if (foundBox && box.left > foundBox.left) {
                    //we found already a box that fits and that is more left
                    continue;
                }

                foundBox = box;
            } else if (afterElement && box.left + box.width / 2 < offsetLeft + startOffsetWidth) {
                //the dragged element is after the current
                box.element.style.left = -startOffsetWidth + 'px';
                for (const cell of rowCells[i]) {
                    cell.style.left = -startOffsetWidth + 'px';
                }
                foundBox = box;
            }
        }
        this.headMove.foundBox = foundBox;
    }

    onHeadDragEnd(event: DuiDragEvent) {
        const element = this.headMove.element;
        if (!element) return;
        const THsBoxes = this.headMoveThBoxes;
        const rowCells = this.headMove.rowCells;
        const foundBox = this.headMove.foundBox;
        const originalPosition = this.headMove.originalPosition;

        element.style.left = '';
        element.style.zIndex = '';
        element.style.opacity = '';

        for (const t of rowCells) {
            for (const cell of t) {
                cell.classList.remove('active-drop');
                cell.classList.remove('other-cell');
                cell.style.left = '0px';
            }
        }

        this.ignoreThisSort = true;

        for (const box of THsBoxes) {
            box.element.style.left = '0px';
            box.element.classList.remove('other-cell');
        }

        const sortedColumns = this.sortedColumns();

        if (foundBox) {
            const newPosition = sortedColumns.indexOf(foundBox.directive);

            if (originalPosition !== newPosition) {
                const directive = sortedColumns[originalPosition];
                sortedColumns.splice(originalPosition, 1);
                sortedColumns.splice(newPosition, 0, directive);

                for (let i = 0; i < sortedColumns.length; i++) {
                    sortedColumns[i].effectivePosition.set(i);
                }
            }
        }

        this.storePreference();
        this.headMove.element = undefined;
    }

    ngAfterViewInit(): void {
        const element = (this.viewportElement() || this.body())?.nativeElement;
        if (!element) return;
        this.removeScrollListener = registerEventListener(element, 'scroll', () => {
            const scrollLeft = element.scrollLeft;
            const header = this.header();
            if (!header) return;
            header.nativeElement.scrollLeft = scrollLeft;
        });
    }

    protected filterFn(item: T) {
        const filter = this.filter();
        if (filter) {
            return filter(item);
        }

        const filterQuery = this.filterQuery();
        const filterFields = this.filterFields();
        if (filterQuery && filterFields) {
            const q = filterQuery!.toLowerCase();
            for (const field of filterFields) {
                if (
                    -1 !==
                    String((item as any)[field])
                        .toLowerCase()
                        .indexOf(q)
                ) {
                    return true;
                }
            }

            return false;
        }

        return true;
    }

    protected createSortFunction(sortField: string, dir: 'asc' | 'desc', next?: (a: any, b: any) => number) {
        return (a: T, b: T) => {
            const aV = this.valueFetcher()(a, sortField);
            const bV = this.valueFetcher()(b, sortField);

            if (aV === undefined && bV === undefined) return next ? next(a, b) : 0;
            if (aV === undefined && bV !== undefined) return +1;
            if (aV !== undefined && bV === undefined) return -1;

            if (dir === 'asc') {
                if (aV > bV) return 1;
                if (aV < bV) return -1;
            } else {
                if (aV > bV) return -1;
                if (aV < bV) return 1;
            }

            return next ? next(a, b) : 0;
        };
    }

    /**
     * @hidden
     */
    @HostListener('keydown', ['$event'])
    protected onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            const firstSelected = first(this.selected());
            if (firstSelected) {
                this.rowDblClick.emit(firstSelected);
            }
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const firstSelected = first(this.selected());
            const items = this.filterSorted();

            if (!firstSelected) {
                this.select(items[0]);
                return;
            }

            let index = indexOf(items, firstSelected);

            // if (-1 === index) {
            //     this.select(this.sorted[0]);
            //     this.paginator.pageIndex = 0;
            //     return;
            // }

            if (event.key === 'ArrowUp') {
                if (0 === index) {
                    return;
                }
                index--;
            }

            if (event.key === 'ArrowDown') {
                if (empty(this.sorted)) {
                    return;
                }
                index++;
            }

            if (items[index]) {
                const item = items[index];
                this.select(item);

                const viewport = this.viewport();
                if (viewport) {
                    const scrollTop = viewport.measureScrollOffset();
                    const viewportSize = viewport.getViewportSize();
                    const itemTop = this.itemHeight() * index;

                    if (itemTop + this.itemHeight() > viewportSize + scrollTop) {
                        const diff = itemTop + this.itemHeight() - (viewportSize + scrollTop);
                        viewport.scrollToOffset(scrollTop + diff);
                    }

                    if (itemTop < scrollTop) {
                        const diff = itemTop - scrollTop;
                        viewport.scrollToOffset(scrollTop + diff);
                    }
                } else {
                    const body = this.body();
                    if (body) {
                        // const rows = this.ro
                        const element = body.nativeElement.children.item(index);
                        if (element) {
                            element.scrollIntoView({
                                block: 'nearest',
                            });
                        }
                    }
                }
            }
        }
    }

    select(item: T, $event?: MouseEvent) {
        if (!this.selectable()) return;

        let cellSelectFired = false;
        if ($event && $event.target) {
            const cell = findParentWithClass($event.target as HTMLElement, 'table-cell');
            if (cell) {
                const column = cell.getAttribute('row-column') || '';
                if (column) {
                    this.cellSelect.emit({ item, cell: column });
                    cellSelectFired = true;
                }
            }
        }

        if (!cellSelectFired) {
            this.cellSelect.emit(undefined);
        }
        const items = this.filterSorted();

        const selected = this.selected();
        if (!this.multiSelect()) {
            this.selected.set([item]);
        } else {
            if ($event && $event.shiftKey) {
                const indexSelected = items.indexOf(item);

                if (selected[0]) {
                    const firstSelected = items.indexOf(selected[0]);

                    if (firstSelected < indexSelected) {
                        //we select all from index -> indexSelected, downwards
                        for (let i = firstSelected; i <= indexSelected; i++) {
                            selected.push(items[i]);
                        }
                    } else {
                        //we select all from indexSelected -> index, upwards
                        for (let i = firstSelected; i >= indexSelected; i--) {
                            selected.push(items[i]);
                        }
                    }
                } else {
                    //we start at 0 and select all until index
                    for (let i = 0; i <= indexSelected; i++) {
                        selected.push(items[i]);
                    }
                }
                this.selected.set([item]);
            } else if ($event && $event.metaKey) {
                if (arrayHasItem(selected, item)) {
                    arrayRemoveItem(selected, item);
                } else {
                    selected.push(item);
                }
                this.selected.set(selected.slice());
            } else {
                const isRightButton = $event && $event.button == 2;
                const isItemSelected = arrayHasItem(selected, item);
                const resetSelection = !isItemSelected || !isRightButton;
                if (resetSelection) {
                    this.selected.set([item]);
                }
            }
        }
    }
}
