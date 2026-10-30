import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RpcClientEventIncomingMessage, RpcClientEventOutgoingMessage, RpcTypes } from '@deepkit/rpc';
import { CodeHighlightComponent } from '@deepkit/ui-library';

import { inspect } from '../../utils';

@Component({
    selector: 'rpc-inspect-message',
    template: `
        <div class="header">
            <div class="id">
                {{ message().id }}
            </div>
            <div class="type">
                {{ RpcTypes[message().type] || message().type }}
            </div>
            <div style="flex: 1;">
                {{ message().date | date: 'MMM d, HH:mm:ss.SSS' }}
            </div>

            @if (message().composite) {
                <div>[composite]</div>
            }
        </div>
        <div class="body">
            @if (message().composite) {
                <div class="composite">
                    @for (m of messages(); track $index) {
                        <div class="message">
                            <div>{{ RpcTypes[m.type] || m.type }}</div>
                            <code-highlight [code]="m.body"></code-highlight>
                        </div>
                    }
                </div>
            } @else {
                <code-highlight [code]="body()"></code-highlight>
            }
        </div>
    `,
    styleUrls: ['./rpc-inspect-message.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DatePipe, CodeHighlightComponent],
})
export class RpcInspectMessageComponent {
    RpcTypes = RpcTypes;
    message = input.required<RpcClientEventIncomingMessage | RpcClientEventOutgoingMessage>();
    messages = computed(() => this.message().messages.map(v => ({ type: v.type, body: inspect(v.body) })));
    body = computed(() => this.message().body);
}
