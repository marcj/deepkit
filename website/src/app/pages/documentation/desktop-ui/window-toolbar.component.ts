import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    InputComponent,
    ListComponent,
    ListItemComponent,
    ListTitleComponent,
    WindowComponent,
    WindowContentComponent,
    WindowFrameComponent,
    WindowHeaderComponent,
    WindowSidebarComponent,
    WindowToolbarComponent,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

import { CodeFrameComponent } from './api-doc.component.js';

@Component({
    host: { ngSkipHydration: 'true' },
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Window Toolbar</h1>
            <app-title value="Window Toolbar"></app-title>

            <doc-code-frame>
                <dui-window-frame>
                    <dui-window>
                        <dui-window-header>
                            Angular Desktop UI

                            <dui-window-toolbar>
                                <dui-button-group>
                                    <dui-button textured icon="envelop"></dui-button>
                                </dui-button-group>

                                <dui-button-group float="sidebar">
                                    <dui-button
                                        textured
                                        (click)="sidebarVisible = !sidebarVisible"
                                        icon="toggle_sidebar"
                                    ></dui-button>
                                </dui-button-group>

                                <dui-button-group padding="none">
                                    <dui-button textured>Cool</dui-button>
                                    <dui-button [active]="true" textured>Right</dui-button>
                                    <dui-button textured>Yes</dui-button>
                                </dui-button-group>

                                <dui-button-group>
                                    <dui-input style="width: 80px;" textured round placeholder="What up?"></dui-input>
                                </dui-button-group>

                                <dui-input
                                    textured
                                    icon="search"
                                    placeholder="Search"
                                    round
                                    clearer
                                    style="margin-left: auto;"
                                ></dui-input>
                            </dui-window-toolbar>
                        </dui-window-header>

                        <dui-window-content [sidebarVisible]="sidebarVisible">
                            <dui-window-sidebar>
                                <dui-list>
                                    <dui-list-title>Sidebar</dui-list-title>
                                    <dui-list-item value="button">Button</dui-list-item>
                                    <dui-list-item value="button-group">Button Group</dui-list-item>
                                </dui-list>
                            </dui-window-sidebar>

                            Content
                        </dui-window-content>
                    </dui-window>
                </dui-window-frame>
                <code-highlight lang="html" [code]="code"></code-highlight>
            </doc-code-frame>
        </div>
    `,
    styleUrls: ['./window.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        WindowComponent,
        WindowHeaderComponent,
        WindowToolbarComponent,
        ButtonGroupComponent,
        ButtonComponent,
        InputComponent,
        WindowContentComponent,
        WindowSidebarComponent,
        ListComponent,
        ListTitleComponent,
        ListItemComponent,
        WindowFrameComponent,
        AppTitle,
    ],
})
export class DocDesktopUIWindowToolbarComponent {
    sidebarVisible = true;

    code = `
            <dui-window>
              <dui-window-header>
                Angular Desktop UI

                <dui-window-toolbar>
                  <dui-button-group>
                    <dui-button textured icon="envelop"></dui-button>
                  </dui-button-group>

                  <dui-button-group float="sidebar">
                    <dui-button textured (click)="sidebarVisible = !sidebarVisible;"
                                icon="toggle_sidebar"></dui-button>
                  </dui-button-group>

                  <dui-button-group padding="none">
                    <dui-button textured>Cool</dui-button>
                    <dui-button [active]="true" textured>Right</dui-button>
                    <dui-button textured>Yes</dui-button>
                  </dui-button-group>

                  <dui-button-group>
                    <dui-input style="width: 80px;" textured round placeholder="What up?"></dui-input>
                  </dui-button-group>

                  <dui-input textured icon="search" placeholder="Search" round clearer
                             style="margin-left: auto;"></dui-input>
                </dui-window-toolbar>
              </dui-window-header>

              <dui-window-content [sidebarVisible]="sidebarVisible">
                <dui-window-sidebar>
                  <dui-list>
                    <dui-list-title>Sidebar</dui-list-title>
                    <dui-list-item value="button">Button</dui-list-item>
                    <dui-list-item value="button-group">Button Group</dui-list-item>
                  </dui-list>
                </dui-window-sidebar>

                Content
              </dui-window-content>
            </dui-window>
`;
}
