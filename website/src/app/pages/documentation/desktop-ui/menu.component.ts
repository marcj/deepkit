import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent, CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';

import {
    MenuComponent,
    MenuDivComponent,
    MenuItemComponent,
    MenuSeparatorComponent,
    OpenExternalDirective,
    SplitterComponent,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [
        CodeHighlightComponent,
        OpenExternalDirective,
        ApiDocComponent,
        AppTitle,
        CodeFrameComponent,
        MenuComponent,
        MenuItemComponent,
        MenuSeparatorComponent,
        MenuDivComponent,
        SplitterComponent,
    ],
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Menu</h1>
            <app-title value="Menu"></app-title>

            <!--        <p>-->
            <!--          Directives to manipulate the application's and windows's OS menu bar.-->
            <!--          This only works when the app is running in Electron.-->
            <!--        </p>-->

            <!--        <p>-->
            <!--          See Electron documentation to check what property values are available.<br />-->
            <!--          <a openExternal="https://electronjs.org/docs/api/menu-item">electronjs.org/docs/api/menu-item</a>-->
            <!--        </p>-->

            <doc-code-frame>
                <div class="bar">
                    <div #element class="bar-left">
                        <dui-menu>
                            <dui-menu-item label="File">
                                <dui-menu-item label="New" hotkey="Meta+N" />
                                <dui-menu-item label="Open…" hotkey="Meta+O" (click)="openItem()" />
                                <dui-menu-item label="Save" hotkey="Meta+S" />
                                <dui-menu-item label="Save As…" hotkey="Meta+Shift+S" />
                                <dui-menu-separator />
                                <dui-menu-item label="Export">
                                    <dui-menu-item label="PNG" hotkey="Meta+E, P" />
                                    <dui-menu-item label="SVG" hotkey="Meta+E, S" />
                                    <dui-menu-item label="PDF" hotkey="Meta+E, D" />
                                </dui-menu-item>
                                <dui-menu-item label="Close" hotkey="Meta+W" />
                                <dui-menu-separator />
                                <dui-menu-item> Do you like what you see? </dui-menu-item>
                                <dui-menu-separator />
                                <dui-menu-div>
                                    @defer {
                                        <a target="_blank" href="https://github.com/deepkit/deepkit-framework"
                                            >Give us a like.</a
                                        >
                                    }
                                </dui-menu-div>
                            </dui-menu-item>

                            <dui-menu-item label="Edit">
                                <dui-menu-item label="Undo" hotkey="Meta+Z" />
                                <dui-menu-item label="Redo" hotkey="Meta+Shift+Z" />
                                <dui-menu-separator />
                                <dui-menu-item label="Cut" hotkey="Meta+X" />
                                <dui-menu-item label="Copy" hotkey="Meta+C" />
                                <dui-menu-item label="Paste" hotkey="Meta+V" />
                            </dui-menu-item>

                            <dui-menu-item label="View">
                                <dui-menu-item label="Zoom In" hotkey="Meta++" />
                                <dui-menu-item label="Zoom Out" hotkey="Meta+-" />
                                <dui-menu-item label="Reset Zoom" hotkey="Meta+0" />
                                <dui-menu-separator />
                                <dui-menu-item label="Toggle Grid" hotkey="G" />
                            </dui-menu-item>

                            <dui-menu-item label="Layer">
                                <dui-menu-item label="New Layer" hotkey="Meta+Shift+N" />
                                <dui-menu-item label="Duplicate Layer" hotkey="Meta+J" />
                                <dui-menu-item label="Merge Down" hotkey="Meta+E" />
                                <dui-menu-separator />
                                <dui-menu-item label="Delete Layer" hotkey="Del" />
                            </dui-menu-item>

                            <dui-menu-item label="Help">
                                <dui-menu-item label="Documentation" hotkey="F1" />
                                <dui-menu-item label="Keyboard Shortcuts" hotkey="Meta+/" />
                                <dui-menu-separator />
                                <dui-menu-item label="About" hotkey="" />
                            </dui-menu-item>
                        </dui-menu>
                    </div>
                    <dui-splitter [(size)]="menuSize" [element]="element" />
                    <div class="bar-right"></div>
                </div>
                <div (click)="click()" class="area"></div>
                <code-highlight lang="html" [code]="code"></code-highlight>
            </doc-code-frame>

            <api-doc component="MenuComponent"></api-doc>
            <api-doc component="MenuItemComponent"></api-doc>
            <api-doc component="MenuSeparatorComponent"></api-doc>
            <!--        <api-doc component="MenuRadioComponent"></api-doc>-->
            <!--        <api-doc component="MenuCheckboxDirective"></api-doc>-->
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        .area {
            height: 250px;
            margin-top: 6px;
            background-color: #555555aa;
        }

        .bar {
            height: 24px;
            overflow: hidden;

            display: flex;
            flex-direction: row;

            dui-splitter {
                background-color: #555555aa;
            }
        }

        .bar-right {
            flex: 1;
        }

        .bar-left {
            overflow: hidden;
        }
    `,
})
export class DocDesktopUIMenuComponent {
    menuSize = signal(200);

    openItem() {
        alert('openItem clicked');
    }

    code = `
<dui-menu>
  <dui-menu-item label="File">
    <dui-menu-item label="New" hotkey="Meta+N" />
    <dui-menu-item label="Open…" hotkey="Meta+O" (click)="openItem()" />
    <dui-menu-item label="Save" hotkey="Meta+S" />
    <dui-menu-item label="Save As…" hotkey="Meta+Shift+S" />
    <dui-menu-separator />
    <dui-menu-item label="Export">
      <dui-menu-item label="PNG" hotkey="Meta+E, P" />
      <dui-menu-item label="SVG" hotkey="Meta+E, S" />
      <dui-menu-item label="PDF" hotkey="Meta+E, D" />
    </dui-menu-item>
    <dui-menu-item label="Close" hotkey="Meta+W" />
    <dui-menu-separator />
    <dui-menu-item>
      Do you like what you see?
    </dui-menu-item>
    <dui-menu-separator />
    <dui-menu-div>
      @defer {
        <a target="_blank" href="https://github.com/deepkit/deepkit-framework">Give us a like.</a>
      }
    </dui-menu-div>
  </dui-menu-item>

  <dui-menu-item label="Edit">
    <dui-menu-item label="Undo" hotkey="Meta+Z" />
    <dui-menu-item label="Redo" hotkey="Meta+Shift+Z" />
    <dui-menu-separator />
    <dui-menu-item label="Cut" hotkey="Meta+X" />
    <dui-menu-item label="Copy" hotkey="Meta+C" />
    <dui-menu-item label="Paste" hotkey="Meta+V" />
  </dui-menu-item>

  <dui-menu-item label="View">
    <dui-menu-item label="Zoom In" hotkey="Meta++" />
    <dui-menu-item label="Zoom Out" hotkey="Meta+-" />
    <dui-menu-item label="Reset Zoom" hotkey="Meta+0" />
    <dui-menu-separator />
    <dui-menu-item label="Toggle Grid" hotkey="G" />
  </dui-menu-item>

  <dui-menu-item label="Layer">
    <dui-menu-item label="New Layer" hotkey="Meta+Shift+N" />
    <dui-menu-item label="Duplicate Layer" hotkey="Meta+J" />
    <dui-menu-item label="Merge Down" hotkey="Meta+E" />
    <dui-menu-separator />
    <dui-menu-item label="Delete Layer" hotkey="Del" />
  </dui-menu-item>

  <dui-menu-item label="Help">
    <dui-menu-item label="Documentation" hotkey="F1" />
    <dui-menu-item label="Keyboard Shortcuts" hotkey="Meta+/" />
    <dui-menu-separator />
    <dui-menu-item label="About" hotkey="" />
  </dui-menu-item>
</dui-menu>
`;

    click() {
        console.log('clicked');
    }
}
