import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnChanges, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';

import { ApiAction } from '@deepkit/api-console-api';
import { isSubject } from '@deepkit/core-rxjs';
import {
    ButtonComponent,
    ButtonGroupComponent,
    DuiDialog,
    IconComponent,
    OptionDirective,
    SelectBoxComponent,
    TabButtonComponent,
} from '@deepkit/desktop-ui';
import { RpcWebSocketClient } from '@deepkit/rpc';
import { CodeHighlightComponent, DeepkitBoxComponent, ToggleBoxComponent } from '@deepkit/ui-library';

import { ControllerClient } from '../../client';
import { InputComponent } from '../../components/inputs/input.component';
import {
    RpcActionState,
    RpcClientConfiguration,
    RpcExecution,
    RpcExecutionSubscription,
    Store,
    extractDataStructureFromParameters,
} from '../../store';
import { inspect, typeToTSJSONInterface } from '../../utils';
import { RpcInspectMessageComponent } from './rpc-inspect-message.component';

@Component({
    selector: 'api-console-action-detail',
    template: `
        <div class="main">
            @if (actionState) {
                <div class="form">
                    <div class="method-container">
                        <dui-button-group class="method" padding="none">
                            <div class="name">
                                <div class="text-selection">
                                    <span class="signature">{{ action().controllerClassName }}.</span
                                    >{{ action().methodName }}(<span class="signature">{{
                                        action().parameterSignature
                                    }}</span
                                    >):
                                    <span class="signature">{{ action().returnSignature }}</span>
                                    {{ store.state.activeRpcClientIndex }}
                                </div>
                            </div>
                            <dui-select textured [(ngModel)]="store.state.rpcClient">
                                @for (client of store.state.rpcClients; track $index) {
                                    <dui-option [value]="client">{{ client.name }}</dui-option>
                                }
                            </dui-select>
                            <dui-button icon="play" textured (click)="execute()"></dui-button>
                        </dui-button-group>
                    </div>
                    <div class="container overlay-scrollbar-small">
                        @if (action().getParametersType(); as parameters) {
                            <deepkit-box title="Parameter">
                                @for (p of parameters; track $index) {
                                    <api-console-input
                                        [decoration]="p"
                                        (keyDown)="consoleInputKeyDown($event)"
                                        [model]="actionState.params.getProperty(p.name)"
                                        [type]="p.type"
                                        (modelChange)="updateState()"
                                    ></api-console-input>
                                }
                            </deepkit-box>
                        }
                        @if (action().getResultsType(); as s) {
                            <deepkit-box title="Return type" style="padding: 12px">
                                <div class="ts text-selection">
                                    <code-highlight [code]="typeToTSJSONInterface(s)"></code-highlight>
                                </div>
                            </deepkit-box>
                        }
                    </div>
                </div>
            }

            <div class="executions">
                <dui-button-group style="margin: 6px 10px; margin-top: 12px;">
                    <dui-tab-button
                        (click)="switchViewRequest('selected')"
                        [active]="store.state.viewRpc.viewRequests === 'selected'"
                        >Selected</dui-tab-button
                    >
                    <dui-tab-button
                        (click)="switchViewRequest('all')"
                        [active]="store.state.viewRpc.viewRequests === 'all'"
                        >All</dui-tab-button
                    >
                </dui-button-group>

                <div class="list overlay-scrollbar-small">
                    @for (e of list; track $index; let i = $index) {
                        <div class="execution">
                            <div class="title-line">
                                <dui-icon
                                    clickable
                                    (click)="e.open = !isOpen(e, i)"
                                    [name]="isOpen(e, i) ? 'arrow_down' : 'arrow_right'"
                                ></dui-icon>
                                <div class="method">{{ e.controllerClassName }}.{{ e.method }}</div>
                                <div class="status">
                                    <div class="status-box" [class.red]="e.error" [class.orange]="e.isObservable()">
                                        {{ getTitleStatus(e) }}
                                    </div>
                                </div>
                                <dui-icon clickable (click)="remove(i)" name="garbage"></dui-icon>
                            </div>
                            @if (isOpen(e, i)) {
                                <div class="result">
                                    <div class="info">
                                        Executed at {{ e.created | date: 'short' }} in {{ e.took | number: '0.0-3' }} ms
                                        using {{ e.clientName }}.
                                    </div>
                                    <div class="content">
                                        @if (e.error) {
                                            <div class="ts text-selection">
                                                <code-highlight [code]="e.error"></code-highlight>
                                            </div>
                                        }
                                        @if (e.isObservable()) {
                                            <div class="ts text-selection">
                                                @if (e.observable; as o) {
                                                    <div>
                                                        <dui-button (click)="subscribe(e, o)">Subscribe</dui-button>
                                                        <dui-button (click)="disconnectObservable(e)"
                                                            >Disconnect observable</dui-button
                                                        >
                                                    </div>
                                                }
                                                @for (sub of e.subscriptions; track trackById($index, sub)) {
                                                    <div class="subscription">
                                                        <div class="header">
                                                            #{{ sub.id }}
                                                            @if (!sub.completed && !sub.error && !sub.unsubscribed) {
                                                                <span>
                                                                    <dui-button (click)="unsubscribe(sub)" small
                                                                        >Unsubscribe</dui-button
                                                                    >
                                                                </span>
                                                            }
                                                            @if (sub.completed) {
                                                                <span>Completed</span>
                                                            }
                                                            @if (sub.unsubscribed) {
                                                                <span>Unsubscribed</span>
                                                            }
                                                        </div>
                                                        @if (sub.error) {
                                                            <div class="error">{{ sub.error }}</div>
                                                        }
                                                        @for (emitted of sub.emitted; track $index; let i = $index) {
                                                            <div class="emitted">
                                                                <div class="ts text-selection">
                                                                    #{{ sub.emitted.length - i }}
                                                                    <code-highlight [code]="emitted"></code-highlight>
                                                                </div>
                                                            </div>
                                                        }
                                                    </div>
                                                }
                                            </div>
                                        }
                                        @if (e.type === 'static') {
                                            <div class="ts text-selection">
                                                <code-highlight [code]="e.result"></code-highlight>
                                            </div>
                                        }
                                    </div>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>
        </div>

        <deepkit-toggle-box
            class="clients"
            title="Clients"
            [(visible)]="store.state.viewRpc.displayClients"
            (visibleChange)="store.store()"
            [(height)]="store.state.viewRpc.displayClientsHeight"
            (heightChange)="store.store()"
        >
            <ng-container header> </ng-container>
            <div style="margin: 6px 10px; margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                <dui-button-group padding="none">
                    <dui-button small icon="add" title="New client" (click)="addRpcClient()"></dui-button>
                    <dui-select small textured [(ngModel)]="store.state.activeDebugRpcClientIndex">
                        @for (client of store.state.rpcClients; track $index; let i = $index) {
                            <dui-option [value]="i">
                                {{ client.name }}
                            </dui-option>
                        }
                    </dui-select>
                    <dui-button small icon="clear" title="Clear history" (click)="deleteClientHistory()"></dui-button>
                    <dui-button
                        small
                        icon="garbage"
                        title="Delete client"
                        [disabled]="store.state.rpcClients.length === 1"
                        (click)="deleteClient()"
                    ></dui-button>
                </dui-button-group>

                <dui-button-group>
                    <dui-tab-button (click)="clientDebugView = 'incoming'" [active]="clientDebugView === 'incoming'"
                        >Incoming</dui-tab-button
                    >
                    <dui-tab-button (click)="clientDebugView = 'outgoing'" [active]="clientDebugView === 'outgoing'"
                        >Outgoing</dui-tab-button
                    >

                    @if (store.state.rpcClients[store.state.activeDebugRpcClientIndex]; as client) {
                        <div class="connection-status">
                            @if (client.client && client.client.transporter.connection | async) {
                                [Connected]
                            } @else {
                                [Disconnected]
                            }
                        </div>
                    }
                </dui-button-group>
            </div>

            <div class="container">
                @if (store.state.rpcClients[store.state.activeDebugRpcClientIndex]; as client) {
                    @if (clientDebugView === 'incoming') {
                        @for (m of client.incomingMessages; track m) {
                            <rpc-inspect-message [message]="m"></rpc-inspect-message>
                        }
                    }
                    @if (clientDebugView === 'outgoing') {
                        @for (m of client.outgoingMessages; track m) {
                            <rpc-inspect-message [message]="m"></rpc-inspect-message>
                        }
                    }
                }
            </div>
        </deepkit-toggle-box>
    `,
    imports: [
        ButtonGroupComponent,
        SelectBoxComponent,
        FormsModule,
        OptionDirective,
        ButtonComponent,
        DeepkitBoxComponent,
        CodeHighlightComponent,
        TabButtonComponent,
        IconComponent,
        DatePipe,
        DecimalPipe,
        ToggleBoxComponent,
        AsyncPipe,
        RpcInspectMessageComponent,
        InputComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./rpc-detail.component.scss'],
})
export class RpcDetailComponent implements OnChanges {
    typeToTSJSONInterface = typeToTSJSONInterface;
    readonly action = input.required<ApiAction>();
    actionState?: RpcActionState;

    list: RpcExecution[] = [];

    clientDebugView: 'incoming' | 'outgoing' = 'incoming';

    args: any[] = [];

    constructor(
        public store: Store,
        private dialog: DuiDialog,
        private cd: ChangeDetectorRef,
    ) {}

    trackById(index: number, item: { id: any }) {
        return item.id;
    }

    getTitleStatus(e: RpcExecution): string {
        if (e.took === -1) return 'PENDING';
        if (e.isObservable()) {
            const atLeastOneActive = e.subscriptions.some(v => !v.error && !v.completed && !v.unsubscribed);

            if (e.observable) {
                if (atLeastOneActive) return 'OBSERVE';
                return 'WAITING';
            }

            if (atLeastOneActive) return 'OBSERVE';
            return 'CLOSED';
        }

        return e.error ? 'ERROR' : 'SUCCESS';
    }

    toggleClientsVisibility() {
        this.store.set(state => {
            state.viewRpc.displayClients = !state.viewRpc.displayClients;
        });
    }

    ngOnChanges(): void {
        this.actionState = this.store.state.getRpcActionState(this.action());
        this.updateList();
    }

    updateState() {
        this.store.store();
    }

    consoleInputKeyDown(event: KeyboardEvent) {
        if (event.key.toLowerCase() === 'enter') {
            this.execute();
        }
    }

    isOpen(e: RpcExecution, i: number): boolean {
        return e.open === undefined ? i === 0 : e.open;
    }

    remove(index: number): void {
        this.store.set(state => {
            const removed = state.rpcExecutions.splice(index, 1);
            for (const r of removed) {
                localStorage.removeItem('@deepkit/api-console/rpcExecution/result/' + r.bodyStoreId);
            }
        });

        this.updateList();
    }

    updateList() {
        if (this.store.state.viewRpc.viewRequests === 'all') {
            this.list = this.store.state.rpcExecutions;
        } else {
            if (this.action()) {
                this.list = this.store.state.rpcExecutions.filter(r => {
                    return this.action().id === r.actionId();
                });
            } else {
                if (this.list.length > 0) this.list = [];
            }
        }
        this.cd.detectChanges();
    }

    switchViewRequest(view: 'all' | 'selected'): void {
        this.store.set(state => {
            state.viewRpc.viewRequests = view;
        });

        this.updateList();
    }

    disconnectObservable(execution: RpcExecution) {
        if (!execution.observable) return;
        // GC will take care of it
        execution.observable = undefined;
        this.cd.detectChanges();
    }

    unsubscribe(sub: RpcExecutionSubscription) {
        sub.unsubscribed = true;
        sub.unsubscribe();
        this.cd.detectChanges();
    }

    subscribe(execution: RpcExecution, observable: Observable<any>) {
        const sub: RpcExecutionSubscription = {
            id: execution.subscriptionsId++,
            emitted: [],
            unsubscribed: false,
            completed: false,
            error: undefined,
            unsubscribe: function () {
                if (isSubject(observable)) {
                    observable.unsubscribe();
                } else {
                    sub.sub.unsubscribe();
                }
            },
            sub: observable.subscribe(
                (v: any) => {
                    const formatted = inspect(v);
                    (sub.emitted as any) = [formatted, ...sub.emitted];
                    this.cd.detectChanges();
                },
                (error: any) => {
                    sub.error = error;
                    this.cd.detectChanges();
                },
                () => {
                    sub.completed = true;
                    this.cd.detectChanges();
                },
            ),
        };
        execution.subscriptions.unshift(sub);
    }

    deleteClientHistory() {
        const client = this.store.state.rpcClient;
        if (!client) return;
        client.outgoingMessages.length = 0;
        client.incomingMessages.length = 0;
    }

    async deleteClient() {
        if (this.store.state.rpcClients.length === 1) return;

        const a = await this.dialog.confirm('Delete client?');
        if (!a) return;

        this.store.state.rpcClients.splice(this.store.state.activeRpcClientIndex, 1);
        this.store.state.activeRpcClientIndex = 0;
        this.store.state.activeDebugRpcClientIndex = 0;
    }

    async addRpcClient() {
        const name = 'Client ' + (this.store.state.rpcClients.length + 1);
        const a = await this.dialog.prompt('New RPC Client', name, 'Please choose a name');
        if (!a) return;
        const client = new RpcClientConfiguration(a);
        this.store.state.rpcClients.push(client);
        this.store.state.rpcClient = client;
        this.store.state.activeDebugRpcClientIndex = this.store.state.activeRpcClientIndex;
        this.store.store();
    }

    async execute() {
        if (!this.actionState) return;

        const args: any[] = [];
        const parametersType = this.action().getParametersType();
        if (parametersType) {
            const parameter: any = {};
            Object.assign(parameter, extractDataStructureFromParameters(this.actionState.params, parametersType));
            args.push(...Object.values(parameter));
        }

        const execution = new RpcExecution(
            this.action().controllerClassName,
            this.action().controllerPath,
            this.action().methodName,
            args.slice(0),
        );

        const client = this.store.state.rpcClient;
        if (!client) return;

        if (!client.client) {
            client.client = new RpcWebSocketClient(ControllerClient.getServerHost());
            client.client.disableTypeReuse();
            client.client.events.subscribe(v => {
                if (v.event === 'incoming') {
                    client.incomingMessages.unshift(v);
                    if (client.incomingMessages.length > 100) {
                        client.incomingMessages.splice(50);
                    }
                } else if (v.event === 'outgoing') {
                    client.outgoingMessages.unshift(v);
                    if (client.outgoingMessages.length > 100) {
                        client.outgoingMessages.splice(50);
                    }
                }
            });
        }

        if (!client.controller[execution.controllerPath]) {
            client.controller[execution.controllerPath] = client.client.controller(execution.controllerPath);
        }

        this.store.set(state => {
            state.rpcExecutions.unshift(execution);
            if (state.rpcExecutions.length > 100) {
                state.rpcExecutions.splice(100);
            }
        });
        this.updateList();

        const start = Date.now();
        try {
            const result: any = await (client.controller[execution.controllerPath] as any)[execution.method](...args);
            execution.took = Date.now() - start;
            if (result instanceof Subject) {
                execution.subject = result;
                execution.type = 'subject';
                this.subscribe(execution, result);
            } else if (result instanceof Observable) {
                execution.observable = result;
                execution.type = 'observable';
            } else {
                execution.result = inspect(result);
            }
        } catch (error) {
            execution.error = inspect(error);
        } finally {
            if (!execution.took) execution.took = Date.now() - start;
            this.cd.detectChanges();
            this.store.store();
        }
    }
}
