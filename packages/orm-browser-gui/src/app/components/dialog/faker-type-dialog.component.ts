import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
    ButtonComponent,
    CheckboxComponent,
    CloseDialogDirective,
    DialogActionsComponent,
    DialogComponent,
    InputComponent,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
} from '@deepkit/desktop-ui';
import { FakerTypes } from '@deepkit/orm-browser-api';

@Component({
    template: `
        <div class="header">
            <dui-input round clearer [(ngModel)]="filterQuery" icon="filter" placeholder="Filter"></dui-input>
        </div>
        <dui-table
            borderless
            no-focus-outline
            [items]="items"
            [filterQuery]="filterQuery"
            [filterFields]="filterFields"
        >
            <dui-table-column name="chosen" [width]="50" header="✓">
                <ng-container *duiTableCell="let item">
                    <dui-checkbox
                        [ngModel]="item.chosen"
                        (ngModelChange)="$event ? chose(item.name) : false"
                    ></dui-checkbox>
                </ng-container>
            </dui-table-column>

            <dui-table-column name="name" [width]="200"></dui-table-column>
            <dui-table-column name="type" [width]="100"></dui-table-column>
            <dui-table-column name="example" [width]="400"></dui-table-column>
        </dui-table>

        <dui-dialog-actions>
            <dui-button closeDialog>Cancel</dui-button>
        </dui-dialog-actions>
    `,
    styles: [
        `
            dui-table {
                flex: 1;
            }

            .header {
                margin-bottom: 12px;
            }

            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        InputComponent,
        FormsModule,
        TableComponent,
        TableColumnDirective,
        TableCellDirective,
        CheckboxComponent,
        DialogActionsComponent,
        ButtonComponent,
        CloseDialogDirective,
    ],
})
export class FakerTypeDialogComponent implements OnInit {
    static dialogDefaults = {
        width: '80%',
        height: '90%',
    };

    filterFields: string[] = ['name', 'type'];

    @Input() fakerTypes!: FakerTypes;
    @Input() selected?: string;

    items: { chosen: boolean; name: string; type: string; example: string }[] = [];

    filterQuery: string = '';

    @Output() chosen = new EventEmitter<string>();

    constructor(protected dialog: DialogComponent) {}

    chose(type: string) {
        this.dialog.close();
        this.chosen.emit(type);
    }

    ngOnInit(): void {
        for (const [name, info] of Object.entries(this.fakerTypes)) {
            this.items.push({ name, chosen: name === this.selected, type: info.type, example: info.example });
        }
        this.items = this.items.slice();
    }
}
