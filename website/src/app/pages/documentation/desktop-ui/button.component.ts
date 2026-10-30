import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent, CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    CheckboxComponent,
    DropdownComponent,
    DropdownItemComponent,
    DropdownSplitterComponent,
    OpenDropdownDirective,
    TabButtonComponent,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    selector: 'app-desktop-ui-button',
    imports: [
        CodeFrameComponent,
        CodeHighlightComponent,
        ButtonComponent,
        CheckboxComponent,
        DropdownComponent,
        DropdownItemComponent,
        DropdownSplitterComponent,
        ApiDocComponent,
        FormsModule,
        OpenDropdownDirective,
        ButtonGroupComponent,
        TabButtonComponent,
        AppTitle,
    ],
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Button</h1>
        <app-title value="Button"></app-title>

        <doc-code-frame>
            <div>
                <dui-button-group>
                    <dui-tab-button [active]="true">Overview</dui-tab-button>
                    <dui-tab-button>List</dui-tab-button>
                </dui-button-group>
                <p>
                    <dui-button [disabled]="disabled">Default Button</dui-button>
                </p>

                <p>
                    <dui-button [active]="true" [disabled]="disabled">Active Button</dui-button>
                </p>

                <p>
                    <dui-button textured [disabled]="disabled">Textured button</dui-button>
                </p>

                <p>
                    <dui-button square [disabled]="disabled">Square button</dui-button>
                    <br />
                </p>

                <p>
                    <dui-button square [disabled]="disabled" icon="add"></dui-button>
                </p>

                <p>
                    <dui-button textured [disabled]="disabled" [openDropdown]="dropdown1" icon="arrow_down" icon-right>
                        Dropdown
                    </dui-button>
                    <dui-dropdown #dropdown1>
                        <div style="padding: 5px 25px;">Hi there!</div>
                    </dui-dropdown>
                </p>

                <p>
                    <dui-button textured [disabled]="disabled" icon="check">Confirm</dui-button>
                    <dui-button textured [disabled]="disabled" icon="check" icon-right>Confirm</dui-button>
                </p>

                <p>
                    <dui-button textured [disabled]="disabled" [openDropdown]="dropdown2" icon="arrow_down" icon-right>
                        Dropdown items
                    </dui-button>
                    <dui-dropdown #dropdown2>
                        <dui-dropdown-item>Flag A</dui-dropdown-item>
                        <dui-dropdown-item [selected]="true">Flag B</dui-dropdown-item>
                        <dui-dropdown-item>Flag C</dui-dropdown-item>
                        <dui-dropdown-splitter></dui-dropdown-splitter>
                        <dui-dropdown-item>Reset</dui-dropdown-item>
                    </dui-dropdown>
                </p>

                <dui-checkbox [(ngModel)]="disabled">Disable all</dui-checkbox>
            </div>
            <code-highlight lang="html" [code]="code" />
        </doc-code-frame>

        <api-doc component="ButtonComponent"></api-doc>
        <api-doc component="TabButtonComponent"></api-doc>
        <api-doc component="HotkeyDirective"></api-doc>
        <api-doc component="FileChooserDirective"></api-doc>
        <api-doc component="FilePickerDirective"></api-doc>
        <api-doc component="FileDropDirective"></api-doc>
    `,
})
export class DocDesktopUIButtonComponent {
    disabled = false;

    code = `
    <dui-button-group>
      <dui-tab-button [active]="true">Overview</dui-tab-button>
      <dui-tab-button>List</dui-tab-button>
    </dui-button-group>
    <p>
        <dui-button [disabled]="disabled">Default Button</dui-button>
    </p>
    
    <p>
        <dui-button [active]="true" [disabled]="disabled">Active Button</dui-button>
    </p>
    
    <p>
        <dui-button textured [disabled]="disabled">Textured button</dui-button>
    </p>
    
    <p>
        <dui-button square [disabled]="disabled">Square button</dui-button>
        <br/>
    </p>
    
    <p>
        <dui-button square [disabled]="disabled" icon="add"></dui-button>
    </p>
    
    <p>
        <dui-button textured [disabled]="disabled" [openDropdown]="dropdown1" icon="arrow_down" icon-right>
            Dropdown
        </dui-button>
        <dui-dropdown #dropdown1>
            <div style="padding: 5px 25px;">
                Hi there!
            </div>
        </dui-dropdown>
    </p>
    
    <p>
        <dui-button textured [disabled]="disabled" [openDropdown]="dropdown2" icon="arrow_down" icon-right>
            Dropdown items
        </dui-button>
        <dui-dropdown #dropdown2>
            <dui-dropdown-item>Flag A</dui-dropdown-item>
            <dui-dropdown-item [selected]="true">Flag B</dui-dropdown-item>
            <dui-dropdown-item>Flag C</dui-dropdown-item>
            <dui-dropdown-splitter></dui-dropdown-splitter>
            <dui-dropdown-item>Reset</dui-dropdown-item>
        </dui-dropdown>
    </p>
    
    <dui-checkbox [(ngModel)]="disabled">Disable all</dui-checkbox>
`;
}
