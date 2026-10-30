import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';

@Component({
    imports: [AppTitle, CodeFrameComponent],
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Styles</h1>
            <app-title value="Styles"></app-title>

            <p>
                The library comes with a few helper CSS classes that can be used to change the appearance and behaviour
                of components.
            </p>

            <h2>Classes</h2>
            <ul>
                <li><code>.dui-theme-dark</code> Set at body and can be used to apply styles for dark mode.</li>
                <li><code>.dui-theme-light</code> Set at body and can be used to apply styles for light mode.</li>
                <li>
                    <code>.dui-normalized</code> Normalizes all standard content like h1, anchors, p, etc. to a
                    consistent look. This also sets scrollbars and <code>box-sizing: border-box</code> and disabled
                    text-selection.
                </li>
                <li><code>.text-selection</code> Allows text selection</li>
                <li><code>.overlay-scrollbar</code> Enables overlay scrollbars with modern styles.</li>
                <li>
                    <code>.overlay-scrollbar-small</code> Enables overlay scrollbars with modern styles and smaller
                    width.
                </li>
                <li><code>.text-tabular</code> Sets <code>font-variant-numeric: tabular-nums</code></li>
                <li><code>.text-light</code> Sets text color to a light shade.</li>
            </ul>

            <h2>CSS Variables</h2>

            <doc-code-frame>
                <ul class="text-selection">
                    <li style="color: var(--dui-selection)">--dui-selection</li>
                    <li style="color: var(--dui-selection-hover)">--dui-selection-hover</li>
                    <li style="color: var(--dui-selection-light)">--dui-selection-light</li>
                    <li style="color: var(--dui-selection-unfocused)">--dui-selection-unfocused</li>
                    <li style="color: var(--dui-button-text)">--dui-button-text</li>
                    <li style="color: var(--dui-input-text)">--dui-input-text</li>
                    <li style="color: var(--dui-text-grey)">--dui-text-grey</li>
                    <li style="color: var(--dui-text-light)">--dui-text-light</li>
                    <li style="color: var(--dui-color-text)">--dui-color-text</li>
                    <li style="color: var(--dui-color-green)">--dui-color-green</li>
                    <li style="color: var(--dui-color-red)">--dui-color-red</li>
                    <li style="color: var(--dui-color-orange)">--dui-color-orange</li>
                    <li style="color: var(--dui-line-color-light)">--dui-line-color-light</li>
                    <li style="color: var(--dui-line-color)">--dui-line-color</li>
                    <li style="color: var(--dui-line-color-prominent)">--dui-line-color-prominent</li>
                    <li style="color: var(--dui-line-sidebar)">--dui-line-sidebar</li>
                    <li style="color: var(--dui-focus-outline-color)">--dui-focus-outline-color</li>
                    <li class="inverse" style="color: var(--dui-window-content-bg)">--dui-window-content-bg</li>
                    <li class="inverse" style="color: var(--dui-background-vibrancy)">--dui-background-vibrancy</li>
                    <li class="inverse" style="color: var(--dui-window-header-bg)">--dui-window-header-bg</li>
                    <li class="inverse" style="color: var(--dui-window-content-bg-trans)">
                        --dui-window-content-bg-trans
                    </li>
                    <li class="inverse" style="color: var(--dui-toolbar-bg-trans)">--dui-toolbar-bg-trans</li>
                </ul>
            </doc-code-frame>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        .inverse {
            background-color: var(--dui-text-light);
        }
    `,
})
export class DocDesktopUIStylesComponent {}
