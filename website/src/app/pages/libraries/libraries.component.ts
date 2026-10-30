import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '@app/app/components/footer.component.js';
import { HeaderComponent } from '@app/app/components/header.component.js';
import { AppTitle } from '@app/app/components/title';
import { TranslatePipe, Translation, i18nRoutePipe } from '@app/app/components/translation.js';
import { libraries, texts } from '@app/common/docs.js';

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
            .category {
                font-size: 12px;
                /*font-weight: 700;*/
                color: #969b9c;
                text-transform: uppercase;
                display: flex;
                flex-direction: row;

                &::after {
                    content: '';
                    display: block;
                    flex: 1;
                    height: 1px;
                    background: rgba(224, 224, 224, 0.16);
                    margin-left: 10px;
                    top: 13px;
                    position: relative;
                }
            }

            .libraries {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                grid-gap: 20px;

                .main {
                    grid-column: 1 / -1;
                }

                .twice {
                    grid-column: 1 / span 2;
                }

                @media (max-width: 640px) {
                    .main,
                    .twice {
                        grid-column: unset;
                    }
                }
            }

            .banner {
                display: flex;
                flex-direction: column;
                gap: 10px;
                text-align: center;
                margin: 20px auto;
                padding: 40px 10px;
                border: 1px dashed rgba(224, 224, 224, 0.16);
                background-color: #12151a;

                h2,
                div {
                    margin: 0;
                    font-size: 16px;
                    font-style: normal;
                    line-height: 180%;
                    color: #c5c5c5;
                    font-weight: normal;
                }

                h2 {
                    color: white;
                }
            }

            .cta {
                display: flex;
                flex-direction: row;
                gap: 10px;
                justify-content: center;

                a,
                a:link {
                    color: white;
                    font-size: 14px;
                }
            }
        `,
    ],
    imports: [
        AppTitle,
        HeaderComponent,
        LibraryEntryComponent,
        RouterLink,
        FooterComponent,
        TranslatePipe,
        i18nRoutePipe,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <app-title value="Libraries"></app-title>
        <dw-header />
        <div class="app-content-full">
            <div class="wrapper banner">
                <h2>{{ texts.banner1 | translate }}</h2>
                <div>{{ texts.banner2 | translate }}</div>

                <div class="cta" style="padding-top: 10px;">
                    <a href="https://discord.gg/U24mryk7Wq"
                        ><img
                            alt="Discord"
                            src="https://img.shields.io/discord/759513055117180999?style=square&label=Discord"
                    /></a>
                    <a href="https://www.npmjs.com/package/@deepkit/type"
                        ><img alt="npm" src="https://img.shields.io/npm/v/@deepkit/type.svg?style=square"
                    /></a>
                </div>
                <div class="cta">
                    <a class="button" routerLink="/{{ translation.lang() }}/documentation/app">{{
                        texts.gettingStarted | translate
                    }}</a>
                    <a class="button" href="https://github.com/deepkit/deepkit-framework">{{
                        texts.viewOnGitHub | translate
                    }}</a>
                </div>
            </div>
            <div class="wrapper libraries">
                @for (category of libraries; track $index) {
                    <div class="category">{{ category.category }}</div>
                    <div class="grid">
                        @for (library of category.items; track $index) {
                            <a
                                [title]="library.title | translate"
                                class="{{ library.class || '' }}"
                                [routerLink]="library.path | i18nRoute"
                                [package]="library.package | translate"
                                [description]="library.description | translate"
                            ></a>
                        }
                    </div>
                }
            </div>
        </div>

        <dw-footer />
    `,
})
export class LibrariesComponent {
    protected readonly libraries = libraries;
    protected readonly texts = texts;

    translation = inject(Translation);
}
