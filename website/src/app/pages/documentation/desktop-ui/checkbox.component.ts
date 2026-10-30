import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent, CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';

import { CheckboxComponent } from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [CodeHighlightComponent, CodeFrameComponent, CheckboxComponent, ApiDocComponent, FormsModule, AppTitle],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Checkbox</h1>
        <app-title value="Checkbox"></app-title>

        <doc-code-frame>
            <div>
                <p>
                    <dui-checkbox [(ngModel)]="active">Disable all</dui-checkbox>
                    <br />
                    Active: {{ active }}
                </p>
                <p>
                    <dui-checkbox [(ngModel)]="active" [disabled]="true">Disabled</dui-checkbox>
                    <br />
                </p>
            </div>
            <code-highlight lang="html" [code]="code" />
        </doc-code-frame>

        <api-doc component="CheckboxComponent"></api-doc>
    `,
})
export class DocDesktopUICheckboxComponent {
    active = false;

    code = `
    <p>
        <dui-checkbox [(ngModel)]="active">Disable all</dui-checkbox>
        <br/>
        Active: {{active}}
    </p>
    <p>
        <dui-checkbox [(ngModel)]="active" [disabled]="true">Disabled</dui-checkbox>
        <br/>
    </p>
`;
}
