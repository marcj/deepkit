import { AfterViewInit, ChangeDetectionStrategy, Component, ContentChildren, Input, QueryList } from '@angular/core';

import { ButtonGroupComponent, TabButtonComponent } from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    selector: 'doc-code-frame',
    template: `
        <div>
            <div style="margin-bottom: 10px;">
                <dui-button-group>
                    <dui-tab-button (click)="showPage('')" [active]="show === ''">Preview</dui-tab-button>
                    @if (hasType('html')) {
                        <dui-tab-button (click)="showPage('html')" [active]="show === 'html'">HTML </dui-tab-button>
                    }
                    @if (hasType('typescript')) {
                        <dui-tab-button (click)="showPage('typescript')" [active]="show === 'typescript'"
                            >TS
                        </dui-tab-button>
                    }
                    @if (hasType('scss')) {
                        <dui-tab-button (click)="showPage('scss')" [active]="show === 'scss'">SCSS </dui-tab-button>
                    }
                </dui-button-group>
            </div>
            @if (show === 'html') {
                <div>
                    <ng-content select="code-highlight[lang=html]"></ng-content>
                </div>
            }
            @if (show === 'typescript') {
                <div>
                    <ng-content select="code-highlight[lang=typescript]"></ng-content>
                </div>
            }
            @if (show === 'scss') {
                <div>
                    <ng-content select="code-highlight[lang=scss]"></ng-content>
                </div>
            }
            @if (show === '') {
                <div
                    class="dui-body dui-normalized"
                    style="background: var(--dui-window-content-bg-trans); padding: 5px; border-radius: 3px;"
                >
                    <ng-content></ng-content>
                </div>
            }
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                position: relative;
            }

            dui-theme-switcher {
                position: absolute;
                right: 5px;
                top: 0px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ButtonGroupComponent, TabButtonComponent],
})
export class CodeFrameComponent implements AfterViewInit {
    @ContentChildren(CodeHighlightComponent) highlighter!: QueryList<CodeHighlightComponent>;

    @Input() height = 300;

    show: '' | 'html' | 'typescript' | 'scss' = '';

    showPage(show: '' | 'html' | 'typescript' | 'scss') {
        this.show = show;
    }

    public hasType(name: string): boolean {
        return Boolean(this.getHighlightForType(name));
    }

    ngAfterViewInit(): void {}

    public getHighlightForType(name: string): CodeHighlightComponent | undefined {
        for (const h of this.highlighter.toArray()) {
            if (h.lang() === name || (name === 'typescript' && !h.lang())) {
                return h;
            }
        }

        return;
    }
}
