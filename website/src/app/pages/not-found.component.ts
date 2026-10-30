import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageResponse } from '@app/app/page-response';

@Component({
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content">
            <h1>404</h1>

            <p>The page you are looking for does not exist.</p>
        </div>
    `,
})
export class NotFoundComponent {
    constructor(pageResponse: PageResponse) {
        pageResponse.notFound();
    }
}
