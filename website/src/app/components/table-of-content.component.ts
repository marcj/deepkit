import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    Injectable,
    computed,
    effect,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentTextService } from '@app/app/components/content-text.component.js';
import { createNotifier } from 'ngxtension/create-notifier';

type HeaderInfo = { label: string; indent: number; top: number; height: number; link: string };

@Injectable({ providedIn: 'root' })
export class TableOfContentService {
    headers = signal<HeaderInfo[]>([]);
    content = signal<HTMLElement | undefined>(undefined);
    contentUpdated = createNotifier();

    constructor() {
        effect(() => {
            this.content();
            this.contentUpdated.listen();
            this.updateHeaders();
        });
    }

    protected lastFrame: ReturnType<typeof setTimeout> | undefined;

    triggerUpdate() {
        if (this.lastFrame) return;
        this.lastFrame = setTimeout(() => {
            this.lastFrame = undefined;
            this.contentUpdated.notify();
        }, 10);
    }

    unregister(content: HTMLElement) {
        if (this.content() !== content) return;
        this.content.set(undefined);
        this.headers.set([]);
    }

    render(content?: HTMLElement) {
        if ('undefined' === typeof window) return;
        this.content.set(content);
    }

    protected updateHeaders() {
        const content = this.content();
        if (!content || !content.getBoundingClientRect) {
            this.headers.set([]);
            return;
        }

        const headers: HeaderInfo[] = [];
        const rect = content.getBoundingClientRect();
        const headerElements = content.querySelectorAll('h1, h2, h3, h4');

        for (const headerElement of headerElements) {
            const label = headerElement.textContent?.trim() || '';
            const link = headerElement.id || '';
            const indent = headerElement.tagName === 'H2' ? 0 : headerElement.tagName === 'H3' ? 1 : 2;
            const top = headerElement.getBoundingClientRect().top - rect.top;
            headers.push({ label, indent, top, link, height: 0 });
        }

        // // if nothing overflows, we don't need a table of content
        // const lastHeader = headers[headers.length - 1];
        // if (headers.length === 0 || lastHeader.top < viewportHeight) {
        //     this.headers.set([]);
        //     return;
        // }

        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            if (i < headers.length - 1) {
                const nextHeader = headers[i + 1];
                header.height = (nextHeader.top - header.top) / rect.height;
            } else {
                header.height = (rect.bottom - header.top) / rect.height;
            }
            header.top = header.top / rect.height;
        }

        this.headers.set(headers);
    }
}

@Component({
    selector: 'app-table-of-content',
    template: `
        <div class="wrapper" tabindex="0" #wrapper>
            @for (line of lines(); track $index) {
                <div class="line" [style.top.px]="line[2]" [class.active]="isActiveLine(line[2])"></div>
            }

            @let tops = this.headersTop();
            @for (header of toc.headers(); track $index) {
                @let top = tops[$index];
                @if (top >= 0) {
                    <a
                        [routerLink]="[]"
                        [fragment]="header.link"
                        class="header"
                        [class.active]="isActiveLine(top)"
                        [style.top.px]="top"
                        >{{ header.label }}</a
                    >
                }
            }
        </div>
    `,
    host: {
        '[class.enabled]': 'enabled()',
    },
    styles: `
        .line {
            position: absolute;
            right: 0;
            width: 10px;
            height: 1px;
            background-color: rgba(192, 192, 192, 0.32);
            transition: 0.1s ease-out;

            &.active {
                background-color: rgba(255, 255, 255, 0.8);
                /*height: 2px;*/
            }
        }

        .header {
            position: absolute;
            left: 5px;
            right: 15px;
            color: #666;
            margin-top: -14px;
            font-size: 12px;
            line-height: 20px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            transition: 0.1s ease-out;

            &.active {
                color: #fff;
                font-weight: bold;
            }
        }

        .wrapper {
            position: absolute;
            top: 30px;
            right: 0;
            bottom: 30px;
            width: 100%;
        }

        :host {
            --max-size: 1000px;
            font-size: 12px;
            position: fixed;
            z-index: 500;
            top: 60px;
            right: 0;
            bottom: 30px;
            width: calc((100% - var(--max-size)) / 2);
            min-width: calc((100% - var(--max-size)) / 2);
            text-align: right;
            background: rgba(9, 10, 11, 0.93);
            -webkit-backdrop-filter: blur(7px);
            backdrop-filter: blur(7px);
            border-radius: 12px;
            transition: 0.1s ease-out;
            opacity: 0;

            &.enabled {
                opacity: 1;
            }

            &.enabled:active,
            &.enabled:hover {
                min-width: 230px;
            }

            a,
            a:link {
                display: block;
                padding: 3px 0;

                &:hover {
                    color: white;
                    text-decoration: none;
                }
            }
        }

        @media (max-width: 1024px) {
            :host {
                right: 6px;
            }
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [RouterLink],
})
export class TableOfContentComponent {
    contentTextService = inject(ContentTextService);
    toc = inject(TableOfContentService);
    interval = 20; //px

    elementRef = viewChild.required('wrapper', { read: ElementRef<HTMLElement> });

    resize = createNotifier();
    viewport = signal({ top: 0, bottom: 0 });

    enabled = computed(() => this.contentTextService.tocVisible() && this.toc.headers().length > 0);

    containerHeight = computed(() => {
        this.resize.listen();
        return this.elementRef().nativeElement.getBoundingClientRect?.().height || 0;
    });

    constructor() {
        effect(() => {
            this.lines();
            this.updateActiveHeader();
        });
    }

    @HostListener('window:resize')
    onResize() {
        this.resize.notify();
    }

    @HostListener('window:scroll')
    onScroll() {
        this.updateActiveHeader();
    }

    isActiveLine(y: number) {
        const section = this.viewport();
        const containerHeight = this.containerHeight();
        y /= containerHeight; // Normalize to 0-1 range
        return y >= section.top && y <= section.bottom;
    }

    private updateActiveHeader() {
        this.toc.contentUpdated.listen();
        const content = this.toc.content();
        if (!content || !content.getBoundingClientRect) return;
        const contentRect = content.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        this.viewport.set({
            top: -contentRect.top / contentRect.height,
            bottom: (-contentRect.top + viewportHeight) / contentRect.height,
        });
    }

    lines = computed(() => {
        const lines: [label: string, url: string, top: number][] = [];
        const containerHeight = this.containerHeight();
        // const containerHeight = headers[headers.length - 1].top + headers[headers.length - 1].height;

        for (let y = 0; y < containerHeight; y += this.interval) {
            const line: [label: string, url: string, top: number] = ['', '', y];
            lines.push(line);
        }
        return lines;
    });

    headersTop = computed(() => {
        const headers = this.toc.headers();
        const headersTop: number[] = Array(headers.length).fill(-1);

        let previousTop = -1;
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const stickyTop = this.headerTop(header.top);
            if (stickyTop === previousTop) continue; // Skip if the top is the same as the previous one
            headersTop[i] = stickyTop;
            previousTop = stickyTop;
        }

        return headersTop;
    });

    /**
     * We get a number like 0.945 and want to make it sticky to the interval of 20px.
     */
    protected headerTop(percentage: number): number {
        const containerHeight = this.containerHeight();
        const top = percentage * containerHeight;
        return Math.round(top / this.interval) * this.interval;
    }
}
