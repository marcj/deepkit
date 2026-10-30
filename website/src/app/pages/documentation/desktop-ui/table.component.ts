import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    DropdownComponent,
    DropdownItemComponent,
    InputComponent,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
    TableCustomRowContextMenuDirective,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    selector: 'page-table',
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        TableComponent,
        DropdownComponent,
        DropdownItemComponent,
        TableColumnDirective,
        TableCellDirective,
        DatePipe,
        ButtonGroupComponent,
        InputComponent,
        ButtonComponent,
        FormsModule,
        TableCustomRowContextMenuDirective,
        AppTitle,
    ],
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Table</h1>
            <app-title value="Table"></app-title>

            <p>
                The table component is per default using virtual scrolling, which means it only renders the rows that
                are currently visible and all have the same height (see <code>itemHeight</code> setting). This is very
                efficient for large datasets.
            </p>

            <p>With right click on the header, you can display additional columns.</p>

            <h2>Virtual Scrolling</h2>

            <doc-code-frame>
                <div>
                    <dui-table
                        style="height: 180px;"
                        [items]="items"
                        [selectable]="true"
                        [(selected)]="selectedItems"
                        preferenceKey="demo"
                    >
                        <dui-dropdown duiTableCustomRowContextMenu>
                            <dui-dropdown-item [disabled]="!selectedItems.length" (click)="remove()"
                                >Delete</dui-dropdown-item
                            >
                        </dui-dropdown>
                        <dui-table-column name="title" header="Title" width="250"></dui-table-column>
                        <dui-table-column name="i" width="30"></dui-table-column>
                        <dui-table-column name="created" header="Created">
                            <ng-container *duiTableCell="let row">
                                {{ row.created | date: 'mediumTime' }}
                            </ng-container>
                        </dui-table-column>
                        <dui-table-column name="columnA" header="Another A" [hidden]="true">
                            <ng-container *duiTableCell="let row"> I'm just A </ng-container>
                        </dui-table-column>
                        <dui-table-column name="columnB" header="Another B" [hidden]="true">
                            <ng-container *duiTableCell="let row"> I'm just B </ng-container>
                        </dui-table-column>
                    </dui-table>
                    <dui-button-group padding="none" style="margin-top: 10px;">
                        <dui-input
                            (enter)="itemName && addItem()"
                            lightFocus
                            [(ngModel)]="itemName"
                            [required]="true"
                        ></dui-input>
                        <dui-button
                            [disabled]="!selectedItems.length"
                            (click)="remove()"
                            square
                            icon="remove"
                        ></dui-button>
                        <dui-button (click)="addItem()" [disabled]="!itemName" square icon="add"></dui-button>
                    </dui-button-group>
                </div>
                <code-highlight lang="html" [code]="code"></code-highlight>
            </doc-code-frame>

            <h2>Disabling Virtual Scrolling</h2>
            <p>
                For small datasets, you can disable virtual scrolling by setting the <code>virtualScroll</code> property
                to <code>false</code>. This enables rows to have different heights. This example has also
                <code>no-focus-outline</code>, <code>multi-select</code>, and <code>freezeColumns</code> enabled.
            </p>

            <doc-code-frame>
                <div>
                    <dui-table
                        style="height: 180px;"
                        [virtualScrolling]="false"
                        [freezeColumns]="1"
                        multi-select
                        no-focus-outline
                        [items]="items"
                        [selectable]="true"
                        [(selected)]="selectedItems"
                        preferenceKey="demo2"
                    >
                        <dui-table-column name="i" width="100" />
                        <dui-table-column name="title" header="Title" width="350" />
                        <dui-table-column name="created" header="Created" width="450" />
                    </dui-table>
                </div>
                <code-highlight lang="html" [code]="code2"></code-highlight>
            </doc-code-frame>

        </div>
    `,
})
export class DocDesktopUITableComponent {
    items = [
        { i: 1, created: new Date(), title: 'first lorem ipsum dolor sit amet consectetur adipiscing elit' },
        { i: 2, created: new Date(), title: 'second lorem ipsum dolor sit amet consectetur adipiscing elit' },
        { i: 3, created: new Date(), title: 'another lorem ipsum dolor sit amet consectetur adipiscing elit' },
        { i: 4, created: new Date(), title: 'yet another lorem ipsum dolor' },
        { i: 5, created: new Date(), title: 'fifth lorem ipsum dolor sit' },
        { i: 6, created: new Date(), title: 'sixth lorem ipsum dolor sit amet consectetur adipiscing elit' },
        { i: 7, created: new Date(), title: 'seventh lorem ipsum dolor sit amet consectetur adipiscing elit' },
        { i: 8, created: new Date(), title: 'eighth lorem ipsum dolor sit amet consectetur adipiscing elit' },
        { i: 9, created: new Date(), title: 'ninth lorem ipsum dolor sit ' },
        { i: 10, created: new Date(), title: 'tenth lorem ipsum dolor sit ' },
    ];

    selectedItems = [];
    itemName = '';
    remove = () => {
        for (const item of this.selectedItems) {
            this.items.splice(this.items.indexOf(item), 1);
        }
        this.items = this.items.slice(0);
        this.selectedItems = [];
    };

    addItem = () => {
        if (this.itemName) {
            this.items.push({ title: this.itemName, i: this.items.length + 1, created: new Date() });
            this.items = this.items.slice(0);
            this.itemName = '';
        }
    };

    code2 = `
    <dui-table style="height: 180px;" [virtualScrolling]="false"
               [freezeColumns]="1" multi-select no-focus-outline [items]="items" [selectable]="true" 
               [(selected)]="selectedItems" preferenceKey="demo2">
      <dui-table-column name="i" width="100" />
      <dui-table-column name="title" header="Title" width="350" />
      <dui-table-column name="created" header="Created" width="450" />
    </dui-table>
`;

    code = `
    <dui-table style="height: 180px;" [items]="items" [selectable]="true" [(selected)]="selectedItems" preferenceKey="demo">
        <dui-dropdown duiTableCustomRowContextMenu>
            <dui-dropdown-item [disabled]="!selectedItems.length" (click)="remove()">Delete</dui-dropdown-item>
        </dui-dropdown>
        <dui-table-column name="title" header="Title" width="250"></dui-table-column>
        <dui-table-column name="i" width="30"></dui-table-column>
        <dui-table-column name="created" header="Created">
            <ng-container *duiTableCell="let row">
                {{"{{"}}row.created|date:'mediumTime'{{"}}"}}
            </ng-container>
        </dui-table-column>
        <dui-table-column name="columnA" header="Another A" hidden>
            <ng-container *duiTableCell="let row">
                I'm just A
            </ng-container>
        </dui-table-column>
        <dui-table-column name="columnB" header="Another B" hidden>
            <ng-container *duiTableCell="let row">
                I'm just B
            </ng-container>
        </dui-table-column>
    </dui-table>
    <dui-button-group padding="none" style="margin-top: 10px;">
        <dui-input (enter)="itemName && addItem()" lightFocus [(ngModel)]="itemName" [required]="true"></dui-input>
        <dui-button [disabled]="!selectedItems.length" (click)="remove()" square icon="remove"></dui-button>
        <dui-button (click)="addItem()" [disabled]="!itemName" square icon="add"></dui-button>
    </dui-button-group>
`;
}
