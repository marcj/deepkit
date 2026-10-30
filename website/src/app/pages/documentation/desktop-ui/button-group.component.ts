import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    ButtonGroupsComponent,
    DropdownComponent,
    OpenDropdownDirective,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        ButtonGroupComponent,
        ButtonComponent,
        ApiDocComponent,
        DropdownComponent,
        OpenDropdownDirective,
        ButtonGroupsComponent,
        AppTitle,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Button group</h1>
        <app-title value="Button Group"></app-title>

        <doc-code-frame>
            <p>
                <dui-button-group padding="none">
                    <dui-button textured>Cool</dui-button>
                    <dui-button textured [active]="true">Right</dui-button>
                    <dui-button textured>Yes</dui-button>
                </dui-button-group>
            </p>

            <p>
                <dui-button-group padding="none">
                    <dui-button>Cool</dui-button>
                    <dui-button>Right</dui-button>
                    <dui-button>Yes</dui-button>
                </dui-button-group>
            </p>

            <p>
                <dui-button-group>
                    <dui-button>Cool</dui-button>
                    <dui-button>Right</dui-button>
                    <dui-button>Yes</dui-button>
                </dui-button-group>
            </p>

            <p>
                <dui-button-groups>
                    <dui-button-group padding="none">
                        <dui-button square icon="add"></dui-button>
                        <dui-button square icon="remove"></dui-button>
                    </dui-button-group>
                    <dui-button-group padding="none">
                        <dui-button square icon="add"></dui-button>
                        <dui-button square icon="remove"></dui-button>
                    </dui-button-group>
                </dui-button-groups>
            </p>
            <div>
                <dui-button-group padding="none">
                    <dui-button textured>Split button</dui-button>
                    <dui-button textured tight icon="arrow_down" [openDropdown]="dropdown1"></dui-button>
                </dui-button-group>
                <dui-dropdown #dropdown1>
                    <div style="padding: 5px 25px;">
                        Hi there!
                        <dui-button (click)="dropdown1.close()">Thanks!</dui-button>
                    </div>
                </dui-dropdown>
            </div>
            <code-highlight lang="html" [code]="code"></code-highlight>
        </doc-code-frame>

        <api-doc component="ButtonGroupComponent"></api-doc>
        <api-doc component="ButtonGroupsComponent"></api-doc>
    `,
})
export class DocDesktopUIButtonGroupComponent {
    code = `
    <p>
        <dui-button-group padding="none">
            <dui-button textured>Cool</dui-button>
            <dui-button textured [active]="true">Right</dui-button>
            <dui-button textured>Yes</dui-button>
        </dui-button-group>
    </p>

    <p>
        <dui-button-group padding="none">
            <dui-button>Cool</dui-button>
            <dui-button>Right</dui-button>
            <dui-button>Yes</dui-button>
        </dui-button-group>
    </p>

    <p>
        <dui-button-group>
            <dui-button>Cool</dui-button>
            <dui-button>Right</dui-button>
            <dui-button>Yes</dui-button>
        </dui-button-group>
    </p>

    <p>
        <dui-button-groups>
          <dui-button-group padding="none">
            <dui-button square icon="add"></dui-button>
            <dui-button square icon="remove"></dui-button>
          </dui-button-group>
          <dui-button-group padding="none">
            <dui-button square icon="add"></dui-button>
            <dui-button square icon="remove"></dui-button>
          </dui-button-group>
        </dui-button-groups>
    </p>
    <div>
        <dui-button-group padding="none">
            <dui-button textured>Split button</dui-button>
            <dui-button textured tight icon="arrow_down" [openDropdown]="dropdown1"></dui-button>
        </dui-button-group>
        <dui-dropdown #dropdown1>
            <div style="padding: 5px 25px;">
                Hi there!
                <dui-button (click)="dropdown1.close()">Thanks!</dui-button>
            </div>
        </dui-dropdown>
    </div>`;
}
