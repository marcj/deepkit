import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Translation } from '@app/app/components/translation';

@Component({
    selector: 'app-more-languages',
    template: `
        @let translationRoutes = translation.routes();
        @let currentLanguage = translation.lang();

        @for (lang of translation.languages; track $index) {
            <a [routerLink]="translationRoutes[lang.code]" [class.active]="currentLanguage === lang.code">{{
                lang.label
            }}</a>
        }
    `,
    styles: `
        :host {
            display: flex;
            padding: 10px 0;
            flex-direction: row;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 12px;
        }

        a,
        a:link {
            color: var(--color-grey);
            font-size: 12px;
            letter-spacing: 1px;
            line-height: 16px;
            text-align: right;
            text-decoration: none;
        }

        a:hover,
        a.active {
            color: var(--color-link);
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [RouterLink],
})
export class MoreLanguagesComponent {
    translation = inject(Translation);
}
