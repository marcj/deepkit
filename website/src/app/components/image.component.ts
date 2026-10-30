import { ChangeDetectionStrategy, Component, Input, OnDestroy } from '@angular/core';
import { AppImagesComponent } from '@app/app/components/images.component.js';

@Component({
    selector: 'app-image',
    standalone: true,
    template: `
        <a target="_blank" href="{{ src }}">
            <img alt="{{ alt || altFromSrc }}" src="{{ src }}" />
        </a>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: flex;
                max-width: 100%;
                text-align: center;
            }

            img {
                object-fit: contain;
            }
        `,
    ],
})
export class ImageComponent implements OnDestroy {
    @Input() src!: string;
    @Input() alt?: string;

    constructor(protected images: AppImagesComponent) {
        images.registerImage(this);
    }

    ngOnDestroy() {
        this.images.unregisterImage(this);
    }

    get altFromSrc(): string {
        let name = this.src.substr(this.src.lastIndexOf('.'));
        name = name.substr(name.lastIndexOf('/'));
        return name;
    }
}
