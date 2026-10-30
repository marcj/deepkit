import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import {
    AdaptiveContainerComponent,
    ButtonComponent,
    CheckboxComponent,
    OpenDropdownDirective,
    RadioButtonComponent,
    RadioGroupComponent,
    SplitterComponent,
} from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    selector: 'app-desktop-ui-button',
    imports: [
        CodeFrameComponent,
        CodeHighlightComponent,
        FormsModule,
        AppTitle,
        AdaptiveContainerComponent,
        ButtonComponent,
        SplitterComponent,
        RadioButtonComponent,
        CheckboxComponent,
        RadioGroupComponent,
        ApiDocComponent,
        OpenDropdownDirective,
    ],
    host: { ngSkipHydration: 'true' },
    template: `
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Adaptive Container</h1>
        <app-title value="Adaptive Container"></app-title>

        <p>
            Adaptive container is a component that allows you to use flex box layout with content that automatically
            hides (display: none) children that overflow the available space.
        </p>

        <p>
            Every children with the class <code>dui-adaptive-fallback</code>
            will be made visible once at least one of the other children is hidden. This allows you to create a button
            that opens a dropdown with the hidden buttons.
        </p>

        <p>
            If you want to customize the dropdown, you can define as children your own <code>dui-dropdown</code> and
            define in it an container element with <code>[duiAdaptiveHiddenContainer]</code> directive. This places the
            hidden elements automatically into this container element.
        </p>
        <doc-code-frame>
            <div class="layout" [class.fill-space]="fillSpace()">
                <div #left class="left">
                    <div #leftTop [class.animate]="animate()">
                        <dui-adaptive-container #container [direction]="direction()">
                            <dui-button>Button 1</dui-button>
                            <dui-button>Big Button 2</dui-button>
                            <dui-button icon="check"></dui-button>
                            <dui-button>Button 4</dui-button>
                            <dui-button>Button 5</dui-button>
                            <dui-button class="dui-adaptive-fallback" [openDropdown]="container.dropdown()"
                                >More</dui-button
                            >
                        </dui-adaptive-container>
                    </div>
                    <dui-splitter horizontal [(size)]="leftTopSize" [element]="leftTop"></dui-splitter>
                    <div>Resize the areas to see how the adaptive container adjusts.</div>
                </div>
                <dui-splitter [(size)]="leftSize" [element]="left"></dui-splitter>
                <div class="actions">
                    <dui-radio-group [(ngModel)]="direction">
                        <dui-radio-button value="row">Row</dui-radio-button>
                        <dui-radio-button value="row-reverse">Row Reverse</dui-radio-button>
                        <dui-radio-button value="column">Column</dui-radio-button>
                        <dui-radio-button value="column-reverse">Column Reverse</dui-radio-button>
                    </dui-radio-group>
                    <dui-checkbox [(ngModel)]="fillSpace">Stretch Buttons</dui-checkbox>
                    <dui-checkbox [(ngModel)]="animate">Animate</dui-checkbox>
                </div>
            </div>
            <code-highlight lang="html" [code]="code" />
        </doc-code-frame>

        <api-doc component="AdaptiveContainerComponent"></api-doc>
        <api-doc component="AdaptiveHiddenContainer"></api-doc>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            dui-radio-group {
                display: flex;
                gap: 8px;
            }

            .layout {
                display: flex;
                flex-direction: row;
                width: 100%;
                height: 250px;
            }

            @keyframes shrinkAndGrow {
                from {
                    width: 50px;
                }

                to {
                    width: 320px;
                }
            }

            .left {
                display: flex;
                flex-direction: column;
                overflow: hidden;

                > div.animate {
                    animation: shrinkAndGrow 4s infinite alternate;
                }
            }

            dui-adaptive-container {
                gap: 4px;
            }

            dui-button {
                flex: 0 0 auto;
            }

            .fill-space dui-button {
                flex: 1;
                min-width: fit-content;
                min-height: fit-content;
            }

            dui-adaptive-container {
                height: 23px;
            }

            dui-adaptive-container.column,
            dui-adaptive-container.column-reverse {
                height: 100%;

                > * {
                    width: 100%;
                }
            }

            .actions {
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex: 1;
                min-width: 350px;
            }

            .layout div {
                padding: 8px;
                background-color: #444444aa;
                overflow: hidden;
            }
        `,
    ],
})
export class DocDesktopUIAdaptiveContainerComponent {
    animate = signal(false);
    fillSpace = signal(false);
    leftTopSize = signal(100);
    leftSize = signal(280);
    direction = signal<'row' | 'column' | 'row-reverse' | 'column-reverse'>('row');

    code = `
    <dui-adaptive-container #container [direction]="direction()">
      <dui-button>Button 1</dui-button>
      <dui-button>Big Button 2</dui-button>
      <dui-button icon="check"></dui-button>
      <dui-button>Button 4</dui-button>
      <dui-button>Button 5</dui-button>
      <dui-button class="dui-adaptive-fallback" [openDropdown]="container.dropdown()">More</dui-button>
    </dui-adaptive-container>
`;
}
