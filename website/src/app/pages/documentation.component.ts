import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { mediaWatch, PlatformHelper } from '@app/app/utils';
import { HeaderLogoComponent, HeaderNavComponent } from '@app/app/components/header.component.js';
import { TableOfContentComponent } from '@app/app/components/table-of-content.component.js';
import { ContentTextService } from '@app/app/components/content-text.component.js';
import { DuiApp } from '@deepkit/desktop-ui';
import { docs, texts, translatesPageTitles } from '@app/common/docs';
import { TranslatePipe, Translation } from '@app/app/components/translation.js';

@Component({
    imports: [
        RouterLinkActive,
        RouterLink,
        FormsModule,
        RouterOutlet,
        HeaderNavComponent,
        HeaderLogoComponent,
        TableOfContentComponent,
        TranslatePipe,
    ],
    standalone: true,
    styleUrls: ['./documentation.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <div class="wrapper">
        <nav [class.showMenu]="showMenu" #nav>
          <dw-header-logo />

          <div class="container">
            @for (doc of docs; track $index) {
              <div class="category">
                @if (doc.category) {
                  <div class="category-title">{{ doc.category|translate }}</div>
                }
                @for (page of doc.pages; track $index) {
                  <a routerLinkActive="active" [routerLinkActiveOptions]="pathMatchOnly"
                     routerLink="/{{translation.lang()}}/documentation/{{ page.path }}">{{ translatesPageTitles(doc) ? (page.title | translate) : page.title }}</a>
                }
              </div>
            }
          </div>
        </nav>
        <div class="page">
          <div class="page-header">
            <dw-header-nav [logo]="breakpoint()">
              <div class="menu-trigger" [class.open]="showMenu"><a (click)="showMenu=!showMenu" class="button">{{ texts.chapters|translate }}</a></div>
            </dw-header-nav>
          </div>
          <div class="content-wrapper">
            <div (click)="showMenu=false; true">
              <router-outlet></router-outlet>
            </div>
          </div>
        </div>
      </div>
      <app-table-of-content />
    `,
})
export class DocumentationComponent implements AfterViewInit, OnDestroy {
    breakpoint = mediaWatch('(max-width: 860px)');

    docs = docs;
    protected readonly translatesPageTitles = translatesPageTitles;
    pathMatchOnly: IsActiveMatchOptions = {
        fragment: 'ignored',
        matrixParams: 'ignored',
        paths: 'exact',
        queryParams: 'ignored',
    };

    showMenu: boolean = false;
    scrolled = false;

    @ViewChild('nav') nav?: ElementRef;

    sub: Subscription;
    translation = inject(Translation);

    constructor(
        public platform: PlatformHelper,
        public router: Router,
        public contentTextService: ContentTextService,
        private duiApp: DuiApp,
    ) {
        this.sub = router.events.subscribe(() => {
            this.showMenu = false;
            setTimeout(() => this.scrollToActiveLink(), 100);
        });
    }

    ngOnDestroy() {
        this.sub.unsubscribe();
    }

    protected scrollToActiveLink() {
        if (!this.platform.isBrowser() || !this.nav) return;

        const active = this.nav.nativeElement.querySelectorAll('a.active');
        active.forEach((el: any) => {
            const rect = el.getBoundingClientRect();
            const isVisible = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
            if (isVisible) return;
            this.scrolled = true;
            el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        });
    }

    ngAfterViewInit() {
        setTimeout(() => this.scrollToActiveLink(), 100);
    }

    protected readonly texts = texts;
}
