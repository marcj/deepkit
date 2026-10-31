import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { bodyToString, Page, parseBody, projectMap } from '@app/common/models';
import { AppDescription, AppTitle } from '@app/app/components/title';
import { ContentRenderComponent } from '@app/app/components/content-render.component';
import { LoadingComponent } from '@app/app/components/loading';
import { ViewportScroller } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ControllerClient } from '@app/app/client';
import { PageResponse } from '@app/app/page-response';
import { ContentTextComponent } from '@app/app/components/content-text.component.js';
import { TableOfContentService } from '@app/app/components/table-of-content.component.js';
import { MoreLanguagesComponent } from '@app/app/components/more-languages.component.js';
import { Translation } from '@app/app/components/translation.js';
import { derivedAsync } from 'ngxtension/derived-async';
import { Seo } from '@app/app/components/seo.js';
import { pendingTask } from '@deepkit/desktop-ui';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
    imports: [
        AppDescription,
        AppTitle,
        ContentRenderComponent,
        LoadingComponent,
        ContentTextComponent,
        MoreLanguagesComponent,

    ],
    styleUrls: ['./page.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <div class="app-content">
        <dui-content-text>
          @if (loading()) {
            <app-loading></app-loading>
          }

          @if (project(); as project) {
            <app-title value="{{project}}" />
          }
          @if (error(); as error) {
            <div class="error">
              {{ error }}
            </div>
          }
          @if (page()?.page; as page) {
            <div #content>
              <app-title value="{{page.title}}" />

              <app-description [value]="bodyToString(subline())" />

              @if (project(); as project) {
                <div class="app-pre-headline">{{ project }}</div>
              }
              <app-render-content [content]="page.body" (onRender)="onRender()"></app-render-content>
            </div>
          }
        </dui-content-text>
        <app-more-languages />
      </div>
    `,
})
export class DocumentationPageComponent implements OnDestroy {
    protected readonly bodyToString = bodyToString;
    content = viewChild('content', { read: ElementRef<HTMLElement> });

    toc = inject(TableOfContentService);
    activatedRoute = inject(ActivatedRoute);
    viewportScroller = inject(ViewportScroller);
    translation = inject(Translation);
    seo = inject(Seo);

    page = derivedAsync<{ page: Page | undefined, error: string } | undefined>(pendingTask(async () => {
        const path = this.currentPath();
        const lang = this.translation.lang();
        try {
            const page = await this.client.main.getPage('documentation/' + path, lang);
            // router.url is still the previous URL while the navigation is running (e.g. in SSR)
            this.seo.setContentLanguage(page.lang, `/${lang}/documentation${path === 'index' ? '' : '/' + path}`, page.languages);
            return { error: '', page };
        } catch (e) {
            this.pageResponse.notFound();
            return {
                error: String(e),
                page: undefined,
            };
        }
    }), {
        initialValue: { page: undefined, error: '' },
    });

    loading = computed(() => this.page() === undefined);
    error = computed(() => this.page()?.error || '');

    url = toSignal(this.activatedRoute.url);

    currentPath = computed(() => {
        const url = this.url();
        if (!url) return 'index';
        if (url.length > 1) {
            return url[0].path + '/' + url[1].path;
        } else if (url.length === 1) {
            return url[0].path || 'index';
        }
        return 'index';
    });

    project = computed(() => {
        const url = this.url();
        if (!url) return '';
        if (url.length > 1) {
            return projectMap[url[0].path] || url[0].path;
        }
        return '';
    });

    subline = computed(() => {
        const page = this.page();
        if (!page || !page.page) return undefined;
        return parseBody(page.page.body).subline;
    });

    constructor(
        private pageResponse: PageResponse,
        private client: ControllerClient,
        public router: Router,
    ) {
        effect(() => {
            this.toc.render(this.content()?.nativeElement);
        });
    }

    ngAfterViewInit() {
        this.onRender();
    }

    ngOnDestroy() {
        const content = this.content();
        if (!content || !content.nativeElement) return;
        this.toc.unregister(content.nativeElement);
    }

    onRender() {
        this.toc.triggerUpdate();
        const fragment = this.activatedRoute.snapshot.fragment;
        if (fragment) {
            this.viewportScroller.scrollToAnchor(fragment);
        }
    }
}
