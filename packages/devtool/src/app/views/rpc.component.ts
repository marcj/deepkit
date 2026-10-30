import { Component, computed, effect, OnInit, Signal, signal } from '@angular/core';
import { clearClient, Client, clients, RpcAction } from '../collector';
import { DatePipe, DecimalPipe, JsonPipe, KeyValuePipe, SlicePipe } from '@angular/common';
import { humanBytes } from '@deepkit/core';
import { FormsModule } from '@angular/forms';
import { RpcTypes } from '@deepkit/rpc';
import { CodeHighlightComponent, DeepkitBoxComponent } from '@deepkit/ui-library';
import { ConnectedPosition } from '@angular/cdk/overlay';
import {
    ButtonGroupComponent,
    CheckboxComponent,
    DropdownComponent,
    IconComponent,
    InputComponent,
    LabelComponent,
    LabelGridComponent,
    OpenDropdownDirective,
    OptionDirective,
    SelectBoxComponent,
    TabButtonComponent,
    TableCellDirective,
    TableColumnDirective,
    TableComponent,
} from '@deepkit/desktop-ui';
import { SafeJsonPipe } from '../utils.js';

@Component({
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }

        .client {
            display: flex;
            flex-direction: row;
            height: 100%;
            flex: 1;

            .stats {
                width: 300px;
                padding: 10px;
            }
        }

        .filter {
            height: 28px;
            display: flex;
            align-items: center;
        }

        .stats {
            .block {
                margin: 5px 0;
            }
        }

        .summary-actions {
            table-layout: fixed;
            width: 100%;

            .action {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .value {
                width: 40px;
                text-align: right;
                padding-left: 10px;
                padding-right: 5px;
            }
        }

        .data {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }

        code-highlight {
            margin-left: 5px;
        }

        table.pretty {
            table-layout: fixed;
            width: 100%;

            td {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                padding: 5px;
            }
        }
    `,
    template: `
      <dui-dropdown width="800px" #detail (hidden)="action.set(undefined)" [connectedPositions]="connectedPositions">
        <div style="padding: 10px;" class="text-selection">
          @if (action(); as message) {
            <h2 style="margin-bottom: 10px;">{{ message.action }}</h2>

            <dui-label-grid>
              <dui-label label="Timestamp">
                {{ message.timestamp|date:'HH:mm:ss.SSS' }}<br />
                {{ message.timestamp|date:'medium' }}
              </dui-label>
              <dui-label label="Status">
                {{ message.status }}
              </dui-label>
            </dui-label-grid>

            <table class="pretty">
              <tr>
                <td>Took:</td>
                <td>
                  @if (message.took) {
                    {{ message.took|number:'0.0-3' }} ms
                  } @else {
                    @if (message.mode !== 'static') {
                      @if (message.completed) {
                        {{ (message.completed - message.timestamp)|number:'0.0-3' }} ms
                      } @else {
                        active
                      }
                    }
                  }
                </td>
              </tr>
              <tr>
                <td>Total size:</td>
                <td>{{ humanBytes(message.size) }}</td>
              </tr>
              <tr>
                <td>Sent size:</td>
                <td>{{ humanBytes(message.sizeSent) }}</td>
              </tr>
              <tr>
                <td>Received size:</td>
                <td>{{ humanBytes(message.sizeReceived) }}</td>
              </tr>
            </table>

            <deepkit-box title="Return Type">
              <code-highlight [code]="message.returnType"></code-highlight>
            </deepkit-box>

            <deepkit-box title="Arguments">
              <code-highlight [code]="message.args | json"></code-highlight>
            </deepkit-box>

            @if (message.mode === 'static') {
              <deepkit-box title="Response">
                <code-highlight [code]="message.response | json"></code-highlight>
              </deepkit-box>
            } @else {
              @for (emit of latest(message.emits, 20); track emit.timestamp) {
                <deepkit-box title="{{message.emits.length}} Emits {{ emit.timestamp|date:'HH:mm:ss.SSS' }}">
                  <code-highlight [code]="emit.data"></code-highlight>
                </deepkit-box>
              }
            }
          }
        </div>
      </dui-dropdown>

      <div class="client">
        @if (selected()?.(); as client) {
          <div class="stats overlay-scrollbar-small">
            <dui-select textured [(ngModel)]="selected" style="width: 100%">
              @for (client of clients(); track client().id) {
                <dui-option [value]="client">
                  {{ client().closed ? '🔴' : '🟢' }}
                  {{ client().url|slice:0:50 }} #{{ client().id }}
                </dui-option>
              }
            </dui-select>

            <div class="block">
              <div>Created: {{ client.createdAt|date:'medium' }}
                ({{ client.closed ? 'closed' : 'open' }})
              </div>
              @if (client.closed) {
                <div>Closed: {{ client.closedAt|date:'medium' }}</div>
              }
            </div>

            @if (client.summary(); as summary) {
              <div class="block">
                <div>Messages received: {{ summary.received }} ({{ humanBytes(summary.receivedBytes) }})
                </div>
                <div>Messages sent: {{ summary.sent }} ({{ humanBytes(summary.sentBytes) }})</div>
                <div>Actions executed: {{ summary.actionsTotal }}</div>
              </div>

              @if (client.type === 'deepkit') {
                <div class="block">
                  <div>Observables: {{ summary.total.observables }} ({{ summary.active.observables }} active)</div>
                  <div>Subscriptions: {{ summary.total.subscriptions }} ({{ summary.active.subscriptions }} active)</div>
                  <div>Subjects: {{ summary.total.subjects }} ({{ summary.active.subjects }} active)</div>
                  <div>BehaviorSubjects: {{ summary.total.behaviorSubjects }} ({{ summary.active.behaviorSubjects }} active)</div>
                  <div>ProgressTracker: {{ summary.total.progressTrackers }} ({{ summary.active.progressTrackers }} active)</div>
                </div>

                <table class="summary-actions">
                  @for (action of summary.actions | keyvalue; track action.key) {
                    <tr>
                      <td class="action">{{ action.key }}</td>
                      <td class="value">{{ action.value }}</td>
                    </tr>
                  }
                </table>
              }
            }
          </div>
          <div class="data">
            @if (client.type === 'deepkit') {
              <div class="filter">
                <dui-icon name="garbage" style="margin-right: 2px;" clickable (click)="clearMessages()" />

                <dui-button-group>
                  <dui-tab-button (click)="tableView.set('actions')" [active]="tableView() === 'actions'">
                    Actions
                  </dui-tab-button>
                  <dui-tab-button (click)="tableView.set('messages')" [active]="tableView() === 'messages'">
                    Messages
                  </dui-tab-button>
                </dui-button-group>

                @if (tableView() === 'actions') {
                  <dui-button-group>
                    <dui-input round textured lightFocus [(ngModel)]="filterText" placeholder="Filter action ..."></dui-input>
                    <dui-select textured [(ngModel)]="filterType" style="width: 150px;">
                      <dui-option value="">All Types</dui-option>
                      <dui-option value="static">Static ({{ types().static || 0 }})</dui-option>
                      <dui-option value="observable">Observable ({{ types().observable || 0 }})</dui-option>
                      <dui-option value="subject">Subject ({{ types().subject || 0 }})</dui-option>
                      <dui-option value="behaviorSubject">BehaviorSubject ({{ types().behaviorSubject || 0 }})</dui-option>
                      <dui-option value="progressTracker">ProgressTracker ({{ types().progressTracker || 0 }})</dui-option>
                    </dui-select>
                    <dui-checkbox [(ngModel)]="filterActiveObservables">Active Observables</dui-checkbox>
                  </dui-button-group>
                }
              </div>
            }

            @if (tableView() === 'messages' || client.type !== 'deepkit') {
              <dui-table hover preferenceKey="rpc/message" [items]="messages()" style="height: 100%;" no-focus-outline
                         defaultSort="idx" defaultSortDirection="desc">
                <dui-table-column name="idx" [width]="50"></dui-table-column>
                <dui-table-column name="id" [width]="50"></dui-table-column>
                <dui-table-column name="direction"></dui-table-column>
                <dui-table-column name="type" [width]="160">
                  <ng-container *duiTableCell="let message">
                    {{ RpcTypes[message.deepkit?.debug.type] }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="timestamp" [width]="120">
                  <ng-container *duiTableCell="let message">
                    {{ message.timestamp|date:'HH:mm:ss.SSS' }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="size">
                  <ng-container *duiTableCell="let message">
                    {{ humanBytes(message.size) }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="data" [width]="500">
                  <ng-container *duiTableCell="let message">
                    {{ message.data | slice:0:500 }}
                  </ng-container>
                </dui-table-column>
              </dui-table>
            } @else {
              <dui-table hover preferenceKey="rpc/actions" [items]="actions()" style="height: 100%;" no-focus-outline
                         [selected]="action() ? [action()] : []"
                         defaultSort="id" defaultSortDirection="desc">
                <dui-table-column name="idx" [width]="50"></dui-table-column>
                <dui-table-column name="id" [width]="50"></dui-table-column>
                <dui-table-column name="action" [width]="300">
                  <ng-container *duiTableCell="let message">
                    <a href="javascript:void;" [openDropdown]="detail" (click)="action.set(message)">{{ message.action }}</a>
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="timestamp" [width]="120">
                  <ng-container *duiTableCell="let message">
                    {{ message.timestamp|date:'HH:mm:ss.SSS' }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="status" [width]="150"></dui-table-column>
                <dui-table-column name="time" [width]="80">
                  <ng-container *duiTableCell="let message">
                    @if (message.took) {
                      {{ message.took|number:'0.0-3' }} ms
                    } @else {
                      @if (message.mode !== 'static') {
                        @if (message.completed) {
                          {{ (message.completed - message.timestamp)|number:'0.0-3' }} ms
                        } @else {
                          active
                        }
                      }
                    }
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="size" [hidden]="true" [width]="80">
                  <ng-container *duiTableCell="let message">
                    {{ humanBytes(message.size) }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="sizeSent" header="sent" [width]="80">
                  <ng-container *duiTableCell="let message">
                    {{ humanBytes(message.sizeSent) }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="sizeReceived" header="recv" [width]="80">
                  <ng-container *duiTableCell="let message">
                    {{ humanBytes(message.sizeReceived) }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="returnType">
                  <ng-container *duiTableCell="let message">
                    {{ message.returnType }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="responses" header="emits" [width]="55"></dui-table-column>
                <dui-table-column name="errors" [width]="55"></dui-table-column>
                <dui-table-column name="subscriptions" header="subs" [width]="55"></dui-table-column>
                <dui-table-column name="args">
                  <ng-container *duiTableCell="let message">
                    {{ message.args | safeJson }}
                  </ng-container>
                </dui-table-column>
                <dui-table-column name="response" header="return/emitted" [width]="500">
                  <ng-container *duiTableCell="let message">
                    {{ message.response | safeJson | slice:0:500 }}
                  </ng-container>
                </dui-table-column>
              </dui-table>
            }
          </div>
        }
      </div>
    `,
    imports: [
        SlicePipe,
        JsonPipe,
        KeyValuePipe,
        FormsModule,
        DatePipe,
        DecimalPipe,
        CodeHighlightComponent,
        DeepkitBoxComponent,
        DropdownComponent,
        LabelGridComponent,
        LabelComponent,
        SelectBoxComponent,
        OptionDirective,
        IconComponent,
        ButtonGroupComponent,
        TabButtonComponent,
        InputComponent,
        CheckboxComponent,
        TableComponent,
        TableColumnDirective,
        TableCellDirective,
        OpenDropdownDirective,
        SafeJsonPipe,
    ],
})
export class RpcViewComponent implements OnInit {
    clients = clients;

    tableView = signal('actions');

    selected = signal<Signal<Client> | undefined>(undefined);

    filterText = signal('');
    filterType = signal('');
    filterErrors = signal(false);
    filterActiveObservables = signal(false);

    actions = computed(() => {
        const selected = this.selected()?.();
        if (!selected) return [];
        const text = this.filterText().toLowerCase();
        const type = this.filterType();
        const activeObservables = this.filterActiveObservables();
        const filterErrors = this.filterErrors();
        let actions = selected.actions();

        if (text) {
            actions = actions.filter(action => action.action.toLowerCase().includes(text));
        }

        if (type) {
            actions = actions.filter(action => action.mode === type);
        }

        if (activeObservables) {
            actions = actions.filter(action => action.active.subscriptions > 0 || action.active.observables > 0 || action.active.subjects > 0 || action.active.behaviorSubjects > 0 || action.active.progressTrackers > 0);
        }

        if (filterErrors) {
            actions = actions.filter(action => action.errors > 0);
        }

        return actions;
    });

    types = computed<{ [name: string]: number }>(() => {
        const selected = this.selected()?.();
        if (!selected) return {};
        const types: { [name: string]: number } = {};
        for (const action of selected.actions()) {
            if (!types[action.mode]) types[action.mode] = 0;
            types[action.mode]++;
        }
        return types;
    });

    action = signal<RpcAction | undefined>(undefined);

    messages = computed(() => {
        const selected = this.selected()?.();
        if (!selected) return [];
        return selected.messages();
    });

    clearMessages() {
        const selected = this.selected()?.();
        if (!selected) return;
        clearClient(selected);
    }

    connectedPositions: ConnectedPosition[] = [{
        originX: 'end',
        originY: 'top',
        overlayX: 'start',
        overlayY: 'top',
    }];

    constructor() {
        effect(() => {
            const selected = this.selected();
            const _clients = clients();
            if (_clients.length === 0) {
                this.selected.set(undefined);
                return;
            }
            if (selected) return;
            const first = _clients[0];
            if (first) this.selected.set(first);
        });
    }

    latest<T>(items: T[], count: number): T[] {
        const next = items.slice(-count);
        next.reverse();
        return next;
    }

    ngOnInit() {
    }

    protected readonly humanBytes = humanBytes;
    protected readonly RpcTypes = RpcTypes;
}
