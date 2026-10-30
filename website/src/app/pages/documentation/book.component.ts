import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ControllerClient } from '@app/app/client.js';
import { ContentRenderComponent } from '@app/app/components/content-render.component.js';
import { ContentTextComponent } from '@app/app/components/content-text.component.js';
import { derivedAsync } from 'ngxtension/derived-async';

import { pendingTask } from '@deepkit/desktop-ui';

@Component({
    selector: 'dw-book',
    imports: [ContentRenderComponent, ContentTextComponent],
    template: `
        @if (page(); as page) {
            <div class="app-content">
                <dui-content-text>
                    <app-render-content [ignoreComponents]="ignoreComponents" [content]="page.body" />
                </dui-content-text>
            </div>
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: block;
        }

        .app-content {
            background: var(--color-content-text-bg);
        }
    `,
})
export class BookComponent {
    ignoreComponents = ['codebox'];

    client = inject(ControllerClient);
    page = derivedAsync(pendingTask(() => this.client.main.getBook()));
}
