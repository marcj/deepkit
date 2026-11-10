import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { RpcClientEventIncomingMessage, RpcClientEventOutgoingMessage } from '@deepkit/rpc';
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
                {{ message().type }}
            </div>
            <div style="flex: 1;">
                {{ message().date | date: 'MMM d, HH:mm:ss.SSS' }}
            </div>
        </div>
        <div class="body">
            <code-highlight [code]="body()"></code-highlight>
        </div>
    `,
    styleUrls: ['./rpc-inspect-message.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DatePipe, CodeHighlightComponent],
})
export class RpcInspectMessageComponent {
    message = input.required<RpcClientEventIncomingMessage | RpcClientEventOutgoingMessage>();
    body = computed(() => {
        const body = this.message().body;
        return body === undefined ? '' : inspect(body);
    });
}
