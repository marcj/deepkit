import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MediaComponent } from './media.component';

@Component({
    template: `
        @if (filesystemId !== undefined) {
            <app-media [filesystem]="filesystemId"></app-media>
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MediaComponent],
})
export class FilesystemComponent {
    filesystemId?: number;

    constructor(private activatedRoute: ActivatedRoute) {
        activatedRoute.params.subscribe(params => {
            this.filesystemId = Number(params.id);
            this.load();
        });
    }

    async load() {
        if (undefined === this.filesystemId) return;
    }
}
