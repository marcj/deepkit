import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import {
    ButtonComponent,
    ButtonGroupComponent,
    DropdownComponent,
    DropdownItemComponent,
    DropdownSplitterComponent,
    OpenDropdownDirective,
    OpenDropdownHoverDirective,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        ButtonComponent,
        ButtonGroupComponent,
        OpenDropdownDirective,
        DropdownComponent,
        ApiDocComponent,
        OpenDropdownHoverDirective,
        DropdownItemComponent,
        DropdownSplitterComponent,
        AppTitle,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Dropdown</h1>
            <app-title value="Dropdown"></app-title>

            <doc-code-frame>
                <dui-button textured [openDropdown]="dropdown1">Toggle dropdown</dui-button>
                <dui-dropdown #dropdown1>
                    <div style="padding: 5px 25px;">Hi there!</div>
                </dui-dropdown>

                <dui-button textured [openDropdownHover]="dropdown2">Hover dropdown</dui-button>
                <dui-dropdown #dropdown2>
                    <div style="padding: 5px 25px;">Wow</div>
                </dui-dropdown>

                <p>
                    <dui-button-group padding="none">
                        <dui-button textured>Split button</dui-button>
                        <dui-button textured tight icon="arrow_down" [openDropdown]="dropdown3"></dui-button>
                    </dui-button-group>
                    <dui-dropdown #dropdown3>
                        <div style="padding: 5px 25px;">
                            Hi there!
                            <dui-button (click)="dropdown3.close()">Close</dui-button>
                        </div>
                    </dui-dropdown>
                </p>

                <p>
                    <dui-dropdown #dropdown4>
                        <dui-dropdown-item>Option 1</dui-dropdown-item>
                        <dui-dropdown-item>Option 2</dui-dropdown-item>
                        <dui-dropdown-separator />
                        <dui-dropdown-item>Abort</dui-dropdown-item>
                    </dui-dropdown>
                    <dui-button icon="arrow_down" icon-right [openDropdown]="dropdown4">Menu</dui-button>
                </p>

                <code-highlight lang="html" [code]="code" />
            </doc-code-frame>

            <api-doc component="DropdownComponent"></api-doc>
            <api-doc component="DropdownItemComponent"></api-doc>

            <api-doc component="OpenDropdownDirective"></api-doc>
            <api-doc component="OpenDropdownHoverDirective"></api-doc>
            <api-doc component="ContextDropdownDirective"></api-doc>

            <api-doc component="DropdownContainerDirective"></api-doc>
            <api-doc component="DropdownSplitterComponent"></api-doc>
        </div>
    `,
})
export class DocDesktopUIButtonDropdownComponent {
    code = `
  <dui-button textured [openDropdown]="dropdown1">Toggle dropdown</dui-button>
  <dui-dropdown #dropdown1>
    <div style="padding: 5px 25px;">
      Hi there!
    </div>
  </dui-dropdown>

  <dui-button textured [openDropdownHover]="dropdown2">Hover dropdown</dui-button>
  <dui-dropdown #dropdown2>
    <div style="padding: 5px 25px;">
      Wow
    </div>
  </dui-dropdown>

  <p>
    <dui-button-group padding="none">
      <dui-button textured>Split button</dui-button>
      <dui-button textured tight icon="arrow_down" [openDropdown]="dropdown3"></dui-button>
    </dui-button-group>
    <dui-dropdown #dropdown3>
      <div style="padding: 5px 25px;">
        Hi there!
        <dui-button (click)="dropdown3.close()">Close</dui-button>
      </div>
    </dui-dropdown>
  </p>
  
  <p>
    <dui-dropdown #dropdown4>
      <dui-dropdown-item>Option 1</dui-dropdown-item>
      <dui-dropdown-item>Option 2</dui-dropdown-item>
      <dui-dropdown-separator />
      <dui-dropdown-item>Abort</dui-dropdown-item>
    </dui-dropdown>
    <dui-button icon="arrow_down" icon-right [openDropdown]="dropdown4">Menu</dui-button>
  </p>
`;
}
