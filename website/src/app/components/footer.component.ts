import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Translation } from '@app/app/components/translation';

@Component({
    selector: 'dw-footer',
    template: `
        <div class="wrapper">
            <div class="copyright">
                <img alt="logo text" src="../../assets/images/deepkit_white_text.svg" />
                <div class="text">© {{ year }} Deepkit®</div>
            </div>
            <nav class="links">
                <!--                <a routerLink="/about-us">About us</a>-->
                <a routerLink="/contact">Contact</a>
                <a routerLink="/data-protection" style="margin-bottom: 25px;">Data protection</a>

                @let translationRoutes = translation.routes();
                @let currentLanguage = translation.lang();

                @for (lang of translation.languages; track $index) {
                    <a [routerLink]="translationRoutes[lang.code]" [class.active]="currentLanguage === lang.code">{{
                        lang.label
                    }}</a>
                }
            </nav>
        </div>
        <div class="wrapper made-in">Made in Germany</div>
    `,
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./footer.component.css'],
})
export class FooterComponent {
    translation = inject(Translation);

    get year() {
        return new Date().getFullYear();
    }
}
