import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { arrayRemoveItem } from '@deepkit/core';
import {
    ButtonComponent,
    ButtonGroupComponent,
    IconComponent,
    InputComponent,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
} from '@deepkit/desktop-ui';

interface Entry {
    name: string;
    value: string;
}

@Component({
    selector: 'api-console-headers',
    template: `
        @if (model()) {
            <dui-table
                no-focus-outline
                [items]="model()"
                borderless
                [virtualScrolling]="false"
                style="min-height: 100px;"
            >
                <dui-table-column class="input-cell" [width]="170" name="name">
                    <ng-container *duiTableCell="let item">
                        <dui-input
                            style="width: 100%"
                            lightFocus
                            [(ngModel)]="item.name"
                            placeholder="Name"
                        ></dui-input>
                    </ng-container>
                </dui-table-column>
                <dui-table-column class="input-cell" [width]="170" name="value">
                    <ng-container *duiTableCell="let item">
                        <dui-input
                            style="width: 100%"
                            lightFocus
                            [(ngModel)]="item.value"
                            placeholder="Value"
                        ></dui-input>
                    </ng-container>
                </dui-table-column>
                <dui-table-column name="delete" header=" " [width]="30" [sortable]="false">
                    <ng-container *duiTableCell="let item">
                        <dui-icon clickable (click)="remove(item)" name="garbage"></dui-icon>
                    </ng-container>
                </dui-table-column>
            </dui-table>
        }

        <dui-button-group>
            <dui-button square style="margin-left: 2px;" (click)="add()" icon="add"></dui-button>
        </dui-button-group>
    `,
    styles: [
        `
            :host ::ng-deep .table-cell.input-cell {
                padding: 2px 2px !important;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        TableComponent,
        TableColumnDirective,
        InputComponent,
        TableCellDirective,
        FormsModule,
        IconComponent,
        ButtonGroupComponent,
        ButtonComponent,
    ],
})
export class HeadersComponent {
    model = model<Entry[]>([]);

    add() {
        this.model().push({ name: '', value: '' });
        this.model.update(v => v.slice());
    }

    remove(item: Entry) {
        const model = this.model();
        if (!model) return;

        arrayRemoveItem(model, item);
        this.model.update(v => v.slice());
    }
}
