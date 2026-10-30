import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { ImageComponent } from './image.component';

@Component({
    selector: 'app-images',
    template: `
        @let selected = this.selected();

        @if (images().length) {
            @if (selected) {
                <div class="image">
                    <app-image style="height: 100%" [alt]="selected.alt" [src]="selected.src"></app-image>
                </div>
            }
            <div class="thumbnails">
                @for (image of images(); track image) {
                    <div [class.selected]="image === selected">
                        <img src="{{ image.src }}" alt="{{ image.alt }}" (click)="select(image)" />
                    </div>
                }
            </div>
        }
    `,
    imports: [ImageComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: block;
                margin: 25px auto;
            }

            .image {
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }

            .actions span {
                display: inline-block;
                padding: 5px;
                margin: 0 2px;
                font-size: 22px;
            }

            .actions span:hover {
                opacity: 0.4;
                cursor: pointer;
            }

            .actions span.selected {
                color: var(--dui-color-orange);
            }

            .thumbnails {
                display: flex;
                flex-wrap: nowrap;
                justify-content: center;
                margin-top: 20px;

                > div {
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    border: 1px solid transparent;
                    border-radius: 5px;
                    overflow: hidden;
                    padding: 0 15px;

                    &.selected {
                        border: 1px solid var(--dui-color-orange);
                    }

                    img {
                        object-fit: contain;
                        max-width: 100%;
                        max-height: 100%;
                    }
                }
            }
        `,
    ],
})
export class AppImagesComponent {
    images = signal<ImageComponent[]>([]);
    selected = signal<ImageComponent | undefined>(undefined);

    registerImage(image: ImageComponent) {
        const images = this.images();
        if (images.includes(image)) return;
        this.images.update(images => [...images, image]);
        if (!this.selected()) {
            this.selected.set(image);
        }
    }

    unregisterImage(image: ImageComponent) {
        const images = this.images();
        const index = images.indexOf(image);
        if (index === -1) return;
        images.splice(index, 1);
        this.images.set(images);
        if (this.selected() === image) {
            this.selected.set(images[0]);
        }
    }

    select(image: ImageComponent) {
        this.selected.set(image);
    }
}
