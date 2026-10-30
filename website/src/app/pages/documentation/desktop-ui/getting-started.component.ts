import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    InputComponent,
    WindowComponent,
    WindowContentComponent,
    WindowFrameComponent,
    WindowHeaderComponent,
    WindowToolbarComponent,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    template: `
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Getting started</h1>
        <app-title value="Getting started"></app-title>

        <p>
            The library <code>&commat;deepkit/desktop-ui</code> is an Angular component library with many useful
            components to create web applications. It is based on standalone components and signals, and thus perfect
            for a zoneless Angular application.
        </p>

        <p>It is available in NPM. Install it with its dependencies in an already existing angular project.</p>

        <code-highlight lang="bash" code="npm install @deepkit/desktop-ui @angular/cdk" />

        <h2>Start using the library</h2>

        <p>Open now your <code>app.component.html</code> and create your first desktop app.</p>

        <code-highlight lang="html" title="app.component.html" [code]="appComponentHtml"></code-highlight>

        <dui-window-frame>
            <dui-window>
                <dui-window-header>
                    Angular Desktop UI
                    <dui-window-toolbar>
                        <dui-button-group>
                            <dui-button textured icon="envelop"></dui-button>
                        </dui-button-group>
                        <dui-button-group float="right">
                            <dui-input textured icon="search" placeholder="Search" round clearer></dui-input>
                        </dui-button-group>
                    </dui-window-toolbar>
                </dui-window-header>
                <dui-window-content>
                    <div>This is the window content</div>
                </dui-window-content>
            </dui-window>
        </dui-window-frame>

        <p>
            Please note that you need at least one and max one <code>dui-window</code> element in your hierarchy. You
            usually put a <code>router-outlet</code> inside the <code>dui-window-content</code> element, so that you can
            navigate to different pages of your application.
        </p>

        <code-highlight lang="html" title="app.component.html" [code]="appComponentRouterHtml"></code-highlight>

        <p>
            Multiple windows are currently not supported except if you use a new Electron Window instance (and thus
            bootstrap the whole Angular application again). This is currently a limitation with Angular itself not
            supporting multiple HTML documents.
        </p>

        <p>If you start from a blank Angular application, you should reset html/body paddings:</p>

        <code-highlight lang="css" title="styles.css" [code]="cssClean"></code-highlight>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        CodeHighlightComponent,
        WindowFrameComponent,
        WindowComponent,
        WindowHeaderComponent,
        WindowToolbarComponent,
        ButtonGroupComponent,
        ButtonComponent,
        WindowContentComponent,
        InputComponent,
        AppTitle,
    ],
})
export class DocDesktopUIGettingStartedComponent {
    appComponentRouterHtml = `
    <dui-window-content>
        <router-outlet/>
    </dui-window-content>
    `;

    appComponentHtml = `
<!-- This loads global styles. Only needed once in your application. -->
<dui-style />

<!-- 'normalize-style' sets useful defaults like font, h1, h2, anchor, p, etc. Remove if you want to have your own styles. -->
<dui-window normalize-style> 
    <dui-window-header>
        Angular Desktop UI
        <dui-window-toolbar>
            <dui-button-group>
                <dui-button textured icon="envelop"></dui-button>
            </dui-button-group>
            <dui-button-group float="right">
                <dui-input textured icon="search" placeholder="Search" round clearer></dui-input>
            </dui-button-group>
        </dui-window-toolbar>
    </dui-window-header>
    <dui-window-content>
        <div>
            This is the window content
        </div>
    </dui-window-content>
</dui-window>
`;

    cssClean = `
html, body {
    padding: 0;
    margin: 0;
    height: 100%;
}
`;
}
