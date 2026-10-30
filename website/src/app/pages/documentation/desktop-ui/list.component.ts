import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import { ListComponent, ListItemComponent, ListTitleComponent } from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        ListComponent,
        FormsModule,
        ListTitleComponent,
        ListItemComponent,
        ApiDocComponent,
        AppTitle,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>List</h1>
            <app-title value="List"></app-title>

            <doc-code-frame>
                <div style="max-width: 350px;">
                    <dui-list [(ngModel)]="selected">
                        <dui-list-title>Form controls</dui-list-title>
                        <dui-list-item value="button">Button</dui-list-item>
                        <dui-list-item value="button-group">Button Group</dui-list-item>

                        <dui-list-title>Window</dui-list-title>
                        <dui-list-item value="window">Window</dui-list-item>
                        <dui-list-item value="toolbar">Toolbar</dui-list-item>
                        <dui-list-item value="sidebar">Sidebar</dui-list-item>

                        <dui-list-title>Buttons & Indicators</dui-list-title>
                        <dui-list-item value="checkbox">Checkbox</dui-list-item>
                        <dui-list-item value="radiobox">Radiobox</dui-list-item>
                        <dui-list-item value="select">Select</dui-list-item>
                    </dui-list>
                    <p>Selected dui-list-item: {{ selected }}</p>
                </div>
                <code-highlight lang="html" [code]="code" />
            </doc-code-frame>

            <api-doc component="ListComponent"></api-doc>

            <api-doc component="ListItemComponent"></api-doc>

            <api-doc component="ListTitleComponent"></api-doc>
        </div>
    `,
})
export class DocDesktopUIListComponent {
    sidebarVisible = true;
    selected = 'button';

    code = `
<dui-list [(ngModel)]="selected">
    <dui-list-title>Form controls</dui-list-title>
    <dui-list-item value="button">Button</dui-list-item>
    <dui-list-item value="button-group">Button Group</dui-list-item>

    <dui-list-title>Window</dui-list-title>
    <dui-list-item value="window">Window</dui-list-item>
    <dui-list-item value="toolbar">Toolbar</dui-list-item>
    <dui-list-item value="sidebar">Sidebar</dui-list-item>

    <dui-list-title>Buttons & Indicators</dui-list-title>
    <dui-list-item value="checkbox">Checkbox</dui-list-item>
    <dui-list-item value="radiobox">Radiobox</dui-list-item>
    <dui-list-item value="select">Select</dui-list-item>
</dui-list>
<p>
    Selected dui-list-item: {{selected}}
</p>
`;
}
