import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    HostListener,
    Input,
    OnChanges,
    ViewChild,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ControllerClient } from '@app/app/client';
import { ContentRenderComponent } from '@app/app/components/content-render.component';
import { LoadingComponent } from '@app/app/components/loading';
import { CommunityQuestion, DocPageResult, bodyToString, link, parseBody } from '@app/common/models';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
    selector: 'app-search-result-page',
    imports: [ContentRenderComponent],
    styles: [
        `
            .path {
                color: #a2a2a2;
                font-size: 12px;
            }

            .title {
                margin: 5px 0;
                color: white;
            }

            .content {
                font-size: 14px;
                max-height: 300px;
                overflow: hidden;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="path">{{ q.type === 'answer' ? 'Question & Answer' : 'Example' }}</div>
        <h3 class="title">{{ q.title }}</h3>
        <div class="content">
            <app-render-content linkRelativeTo="/" [content]="q.content"></app-render-content>
        </div>
    `,
})
export class SearchResultQuestion implements OnChanges {
    @Input() q!: CommunityQuestion;
    subline: string = '';

    ngOnChanges() {
        this.subline = bodyToString(parseBody(this.q.content).subline);
    }
}

@Component({
    selector: 'app-search',
    imports: [
        ReactiveFormsModule,
        FormsModule,
        LoadingComponent,
        RouterLink,
        SearchResultQuestion,
        ContentRenderComponent,
    ],
    styles: [
        `
            :host {
                max-width: 50%;
            }

            .search {
                position: relative;
                z-index: 2001;
                display: flex;

                a.button {
                    margin-left: 10px;
                    display: none;
                }
            }
            .search.active {
                .app-search-field {
                    /*width: 350px;*/
                }
            }

            @media (max-width: 760px) {
                .search.active {
                    .app-search-field {
                        width: unset;
                    }
                    a.button {
                        display: block;
                    }
                }

                :host {
                    position: absolute;
                    left: 15px;
                    top: 26px;
                }
            }

            .overlay {
                position: fixed;
                top: 0px;
                left: 0px;
                right: 0px;
                bottom: 0;
                height: 100vh;
                z-index: 2000;
                background-color: rgba(0, 0, 0, 0.6);
                overflow: hidden;

                .wrapper {
                    max-height: 100%;

                    .box {
                        padding-top: 80px;
                        background-color: #0e1217;
                        box-shadow: 0 0 10px black;
                        max-width: 650px;
                    }

                    .box-container {
                        position: relative;
                        padding: 10px 35px;
                        max-height: calc(100vh - 100px);
                    }
                }
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="search" [class.active]="visible">
            <div class="app-search-field">
                <input
                    (focus)="visible = true"
                    #input
                    (keyup)="onKeyUp($event)"
                    (click)="visible = true"
                    placeholder="Search the docs"
                    [(ngModel)]="query"
                    (ngModelChange)="find()"
                />
                <img alt="search icon" src="/assets/images/icons-search.svg" style="width: 18px; height: 18px;" />
            </div>
            <a class="button" (click)="visible = false">Close</a>
        </div>

        @if (visible) {
            <div class="overlay" (click)="onOverlayClick($event)">
                @if (loading) {
                    <app-loading></app-loading>
                }
                <div class="wrapper">
                    <div class="box">
                        <div class="box-container scroll-small">
                            @if (results) {
                                <div class="search-results">
                                    @for (r of results.community; track r) {
                                        <div
                                            [routerLink]="link(r)"
                                            (click)="visible = false"
                                            class="app-search-result-item"
                                        >
                                            <app-search-result-page [q]="r"></app-search-result-page>
                                        </div>
                                    }
                                    @for (r of results.pages; track r) {
                                        <div
                                            [routerLink]="'/' + r.url"
                                            (click)="visible = false"
                                            class="app-search-result-item"
                                        >
                                            <div class="path">{{ r.path }}</div>
                                            <h3 class="title">{{ r.title }}</h3>
                                            <div class="content">
                                                <app-render-content [content]="r.content"></app-render-content>
                                            </div>
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    </div>
                </div>
            </div>
        }
    `,
})
export class SearchComponent {
    query: string = '';
    results?: { pages: DocPageResult[]; community: CommunityQuestion[] };
    loading = false;

    visible: boolean = false;
    modelChanged = new Subject<string>();
    link = link;

    @ViewChild('input') input?: ElementRef<HTMLInputElement>;

    constructor(
        private client: ControllerClient,
        private cd: ChangeDetectorRef,
        public router: Router,
    ) {
        this.modelChanged.pipe(debounceTime(500), distinctUntilChanged()).subscribe(query => this._find(query));
    }

    @HostListener('document:keydown', ['$event'])
    onKeydownHandler(event: KeyboardEvent) {
        //handle CMD+K, WIN+K, CTRL+K for search
        if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
            if (!this.input) return;
            event.preventDefault();
            this.input.nativeElement.focus();
            this.visible = true;
            this.cd.detectChanges();
        }
    }

    onKeyUp(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            this.visible = false;
        } else {
            this.visible = true;
        }
    }

    onOverlayClick(e: MouseEvent) {
        //check if clicked inside .box-container, if so ignore
        if ((e.target as HTMLElement).closest('.box')) {
            return;
        }
        this.visible = false;
    }

    find() {
        this.modelChanged.next(this.query);
    }

    async _find(query: string) {
        this.loading = true;
        this.cd.detectChanges();
        try {
            this.results = await this.client.main.search(query);
            console.log('this.results', this.results);
        } finally {
            this.loading = false;
            this.cd.detectChanges();
        }
    }
}
