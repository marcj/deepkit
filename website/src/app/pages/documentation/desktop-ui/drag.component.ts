import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent, CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';

import { DragDirective, DuiDragEvent, PositionChangeDirective, SplitterComponent } from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    host: { ngSkipHydration: 'true' },
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        ApiDocComponent,
        DragDirective,
        SplitterComponent,
        AppTitle,
        PositionChangeDirective,
    ],
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Drag</h1>
            <app-title value="Drag"></app-title>

            <p>
                The directive <code>DragDirective</code> allows to listen to drag gestures on an element. It can be used
                to implement custom drag and drop functionality, to create resizable elements, or to implement custom
                drag interactions.
            </p>

            <p>
                This example uses another directive <code>duiPositionChange</code> which uses
                <code>observePosition</code>
                to monitor arbitrary element position and size changes (using efficient IntersectObserver and
                ResizeObserver).
            </p>

            <doc-code-frame>
                <div class="area">
                    <div
                        class="knob"
                        (duiDrag)="onDrag($event)"
                        (duiDragStart)="onDragStart($event)"
                        (duiPositionChange)="position.set($event)"
                        [style.left.px]="left()"
                    >
                        Drag Me
                    </div>
                </div>
                <div class="area">
                    @if (position(); as pos) {
                        {{ pos.x }}px/{{ pos.y }}px
                    }
                </div>
                <code-highlight lang="html" [code]="dragCode" />
                <code-highlight lang="typescript" [code]="dragCodeTS" />
            </doc-code-frame>

            <api-doc component="DragDirective"></api-doc>

            <h2>Splitter</h2>

            <p>The component <code>dui-splitter</code> is tailored for resizing layouts, such as sidebars or panels.</p>

            <p>
                Use <code>[element]</code> to safely set the <code>[property]</code> of the element. It makes sure that
                <code>[size]</code>
                it the real size of the element after drag ended. Use instead or additionally [size] with (sizeChange)
                to persist and load the size in e.g. localStorage.
            </p>

            <doc-code-frame>
                <div class="splitter">
                    <div class="top" #top [style.flex-basis.px]="topSize()">Top Area ({{ topSize() }}px)</div>
                    <dui-splitter [(size)]="topSize" horizontal indicator [element]="top" />
                    <div class="bottom">Bottom Area</div>
                </div>
                <code-highlight lang="html" [code]="splitterCode" />
                <code-highlight lang="typescript" [code]="splitterCodeTS" />
            </doc-code-frame>

            <api-doc component="SplitterComponent"></api-doc>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        .area {
            height: 50px;
            background-color: #333333aa;
            position: relative;

            .knob {
                border-radius: 2px;
                position: absolute;
                display: flex;
                text-align: center;
                align-items: center;
                justify-content: center;
                top: 0;
                left: 0;
                width: 50px;
                height: 50px;
                background-color: #111111dd;
                cursor: move;
            }
        }

        .splitter {
            display: flex;
            flex-direction: column;
            height: 400px;
            width: 100%;
            overflow: hidden;
            background-color: #333333aa;

            .top {
                background-color: #444444aa;
                padding: 10px;
                text-align: center;
            }

            .bottom {
                background-color: #555555aa;
                padding: 10px;
                text-align: center;
                min-height: 50px;
                flex: 1;
            }
        }
    `,
})
export class DocDesktopUIDragComponent {
    topSize = signal(100);

    position = signal<DOMRectReadOnly | undefined>(undefined);

    left = signal(150);
    protected leftStart = 0;

    onDrag(event: DuiDragEvent) {
        const value = this.leftStart + event.deltaX;
        this.left.set(Math.max(0, Math.min(value, 250)));
    }

    onDragStart(event: DuiDragEvent) {
        this.leftStart = this.left();
    }

    splitterCode = `
      <div class="splitter">
        <div class="top" #top [style.flex-basis.px]="topSize()">
          Top Area ({{ topSize() }}px)
        </div>
        <dui-splitter [(size)]="topSize" horizontal indicator [element]="top" />
        <div class="bottom">
          Bottom Area
        </div>
      </div>
    `;
    splitterCodeTS = `
topSize = signal(100);
`;

    dragCodeTS = `
    left = signal(0);
    protected leftStart = 0;

    onDrag(event: DuiDragEvent) {
        const value = this.leftStart + event.deltaX;
        this.left.set(Math.max(0, Math.min(value, 250)));
    }

    onDragStart(event: DuiDragEvent) {
        this.leftStart = this.left();
    }
    `;

    dragCode = `
      <div class="area" (duiDrag)="onDrag($event)" (duiDragStart)="onDragStart($event)"
                 (duiPositionChange)="position.set($event)">
        <div class="knob" [style.left.px]="left()">Drag Me</div>
      </div>
      <div class="area">
        @if (position(); as pos) {
          {{ pos.x }}px/{{ pos.y }}px
        }
      </div>
    `;
}
