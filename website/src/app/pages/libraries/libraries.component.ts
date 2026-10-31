import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, i18nRoutePipe } from '@app/app/components/translation.js';
import { libraries } from '@app/common/docs.js';

@Component({
    selector: 'a[package]',
    template: `
        <div class="title">
            <span>{{ title() }}</span>
            <span class="package">{{ package() }}</span>
        </div>
        <div>
            {{ description() }}
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host,
        :host:link {
            display: flex;
            background: rgba(24, 28, 35, 0.6);
            flex-direction: column;
            gap: 6px;
            padding: 20px 17px;
            border-radius: 4px;
            /*border-top: 1px solid rgba(224, 224, 224, 0.26);*/
            cursor: pointer;
            font-size: 13px;
            color: #e3ecf0;
        }

        :host:hover {
            background: rgba(24, 28, 35, 0.9);
            text-decoration: none !important;
            color: #e3ecf0 !important;
            /*  border-top: 1px solid var(--color-link);*/
        }

        .title {
            color: white;
            display: flex;
            gap: 6px;
            font-size: 15px;

            &:hover {
                text-decoration: none;
            }
        }

        .package {
            margin-left: auto;
            text-align: right;
            color: #969b9c;
            font-size: 12px;
            white-space: nowrap;
        }
    `,
})
export class LibraryEntryComponent {
    title = input.required<string>();
    package = input.required<string>();
    description = input.required<string>();
}

@Component({
    selector: 'app-libraries',
    styles: [
        `
            .libraries {
                display: flex;
                flex-direction: column;
            }

            .category {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
                gap: 40px;
                padding: 40px 0;
                border-top: 1px solid rgba(224, 224, 224, 0.12);
            }

            .intro h3 {
                font-size: 22px;
                font-weight: 400;
                color: #f9eddf;
                margin: 0 0 12px;
            }

            .intro p {
                font-size: 14px;
                line-height: 1.8;
                color: #a9adb3;
                margin: 0;
            }

            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                grid-gap: 12px;
                align-content: start;
            }

            @media (max-width: 760px) {
                .category {
                    grid-template-columns: minmax(0, 1fr);
                    gap: 20px;
                }
            }
        `,
    ],
    imports: [LibraryEntryComponent, RouterLink, TranslatePipe, i18nRoutePipe],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="libraries">
            @for (category of libraries; track $index) {
                <section class="category">
                    <div class="intro">
                        <h3>{{ category.category | translate }}</h3>
                        <p>{{ category.description | translate }}</p>
                    </div>
                    <div class="grid">
                        @for (library of category.items; track $index) {
                            <a
                                [title]="library.title | translate"
                                [routerLink]="library.path | i18nRoute"
                                [package]="library.package"
                                [description]="library.description | translate"
                            ></a>
                        }
                    </div>
                </section>
            }
        </div>
    `,
})
export class LibrariesComponent {
    protected readonly libraries = libraries;
}
