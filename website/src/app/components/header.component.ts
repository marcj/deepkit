import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SearchComponent } from '@app/app/components/search.component';
import { TranslatePipe, Translation } from '@app/app/components/translation';
import { texts } from '@app/common/docs';

import { DropdownComponent, OpenDropdownDirective } from '@deepkit/desktop-ui';

@Component({
    selector: 'dw-header-logo',
    template: `
        @let url = translation.lang();
        <a class="logo" routerLink="/{{ url === 'en' ? '' : url }}"
            ><img alt="deepkit logo" style="height: 25px;" src="/assets/images/deepkit_white_text.svg"
        /></a>
    `,
    styles: `
        :host {
            display: flex;
            align-items: center;
            flex: 1;
            gap: 30px;
            height: 80px;
            line-height: 0;
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [RouterLink],
})
export class HeaderLogoComponent {
    translation = inject(Translation);
}

@Component({
    selector: 'dw-header-nav',
    template: `
        @if (logo()) {
            <dw-header-logo />
        }

        <ng-content />

        <div class="language">
            @let translationRoutes = translation.routes();
            @let currentLanguage = translation.lang();

            <dui-dropdown #languageDropdown dropdownClass="languages-dropdown">
                @for (lang of translation.languages; track $index) {
                    <a [routerLink]="translationRoutes[lang.code]" [class.active]="currentLanguage === lang.code">{{
                        lang.label
                    }}</a>
                }
            </dui-dropdown>

            @let labels = translation.labels();
            <a [openDropdown]="languageDropdown">{{ labels[currentLanguage] }}</a>
        </div>
        <div class="socials">
            <a href="https://discord.gg/U24mryk7Wq" target="_blank">
                <svg
                    width="800px"
                    height="800px"
                    viewBox="0 -28.5 256 256"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="xMidYMid"
                >
                    <g>
                        <path
                            d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z"
                            fill="white"
                            fill-rule="nonzero"
                        ></path>
                    </g>
                </svg>
            </a>
            <a href="https://github.com/deepkit/deepkit-framework" target="_blank">
                <img width="24" height="24" alt="github" src="/assets/images/github.svg" />
            </a>
            <a href="https://twitter.com/marcjschmidt" target="_blank">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <path
                        id="twitter-logo"
                        fill="white"
                        d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"
                    />
                </svg>
            </a>
        </div>
        <div class="tail">
            <a routerLinkActive="active" routerLink="/{{ translation.lang() }}/documentation">{{
                texts.docs | translate
            }}</a>
            <a routerLinkActive="active" routerLink="/{{ translation.lang() }}/blog">{{ texts.blog | translate }}</a>
        </div>
    `,
    imports: [
        RouterLinkActive,
        RouterLink,
        DropdownComponent,
        OpenDropdownDirective,
        TranslatePipe,
        HeaderLogoComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            flex-wrap: wrap;
            flex: 1;
            gap: 10px 30px;
            text-align: left;
        }

        @media (max-width: 860px) {
            :host {
                justify-content: center;
                padding-bottom: 15px;
            }

            dw-header-logo {
                flex-basis: 100%;
                justify-content: center;
            }
        }

        .socials {
            display: flex;
            align-items: center;
            gap: 16px;

            a,
            a:link {
                opacity: 0.7;

                &:hover {
                    opacity: 1;
                }
            }
        }

        .tail {
            display: flex;
            gap: 30px;
        }

        @media (max-width: 540px) {
            :host {
                justify-content: center;
            }

            .tail {
                flex-basis: 100%;
                justify-content: center;
                gap: 16px;
            }
        }

        .language a,
        .language a:link {
            cursor: pointer;
        }

        ::ng-deep .languages-dropdown {
            border: 0;
            background: black !important;
            box-shadow: unset !important;
            border: unset !important;
            text-align: left;
        }

        ::ng-deep .languages-dropdown > div {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 14px;
        }

        ::ng-deep .languages-dropdown a,
        .languages-dropdown a:link {
            padding: 0 12px;
        }

        svg,
        img {
            width: 15px;
            height: 15px;
        }

        a,
        a:link {
            text-decoration: none;
            color: #e3ecf0;
            font-weight: 600;
            line-height: 26px;

            &:last-child {
                margin-right: 0;
            }

            &:hover {
                color: var(--color-orange);
            }

            &.active {
                color: var(--color-orange);
            }

            img,
            svg {
                position: relative;
                top: 4px;
            }
        }
    `,
})
export class HeaderNavComponent {
    logo = input(false);

    translation = inject(Translation);
    protected readonly texts = texts;
}

@Component({
    selector: 'dw-header',
    template: `
        <div class="wrapper" [class.showMenu]="showMenu()">
            @if (!hideLogo()) {
                <dw-header-logo />
            }

            @if (search()) {
                <app-search></app-search>
            }

            <!--        <a class="burger" (click)="toggleMenu()">-->
            <!--          <svg width="21px" height="16px" viewBox="0 0 21 16" version="1.1" xmlns="http://www.w3.org/2000/svg">-->
            <!--            <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">-->
            <!--              <g id="burger" [attr.fill]="'white'">-->
            <!--                <rect id="Rectangle" x="0" y="0" width="21" height="2"></rect>-->
            <!--                <rect id="Rectangle" x="0" y="7" width="21" height="2"></rect>-->
            <!--                <rect id="Rectangle" x="0" y="14" width="21" height="2"></rect>-->
            <!--              </g>-->
            <!--            </g>-->
            <!--          </svg>-->
            <!--        </a>-->
            <dw-header-nav />
        </div>
    `,
    host: {
        '[class.float]': 'float()',
    },
    imports: [ReactiveFormsModule, SearchComponent, HeaderNavComponent, HeaderLogoComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
    hideLogo = input(false);
    float = input(false);
    search = input(false);

    menu = signal('');
    showMenu = signal(false);

    protected lastTimeout: any;

    constructor(public router: Router) {
        router.events.subscribe(() => {
            this.menu.set('');
            this.showMenu.set(false);
        });
    }

    toggleMenu() {
        this.showMenu.update(v => !v);
    }

    open(menu: string) {
        if (this.lastTimeout) {
            clearTimeout(this.lastTimeout);
        }

        this.menu.set(menu);
    }

    close(menu: string) {
        this.lastTimeout = setTimeout(() => {
            if (this.menu() === menu) {
                this.menu.set('');
            }
        }, 200);
    }
}
