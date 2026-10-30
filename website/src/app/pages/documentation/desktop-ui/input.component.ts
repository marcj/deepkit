import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import { ButtonComponent, ButtonGroupComponent, InputComponent } from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        ButtonGroupComponent,
        ButtonComponent,
        InputComponent,
        FormsModule,
        ApiDocComponent,
        AppTitle,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Input</h1>
            <app-title value="Input / Textarea"></app-title>

            <doc-code-frame>
                <div>
                    <dui-button-group>
                        <dui-button textured [disabled]="name === ''" (click)="name = ''">clear</dui-button>
                    </dui-button-group>

                    <p>
                        <dui-input placeholder="Username"></dui-input>
                        default with placeholder
                    </p>

                    <p>
                        <dui-input [(ngModel)]="name"></dui-input>
                        default
                    </p>

                    <p>
                        <dui-input clearer [disabled]="true" [(ngModel)]="name"></dui-input>
                        disabled
                    </p>

                    <p>
                        <dui-input clearer [(ngModel)]="name"></dui-input>
                        clearer
                    </p>

                    <p>
                        <dui-input textured [(ngModel)]="name"></dui-input>
                        textured
                    </p>

                    <p>
                        <dui-input round [(ngModel)]="name"></dui-input>
                        round
                    </p>

                    <p>
                        <dui-input round lightFocus [(ngModel)]="name"></dui-input>
                        round lightFocus
                    </p>
                    <p>
                        <dui-input round lightFocus semiTransparent [(ngModel)]="name"></dui-input>
                        round lightFocus semiTransparent
                    </p>

                    <p>
                        <dui-input icon="star" [(ngModel)]="name"></dui-input>
                    </p>

                    <p>
                        <dui-input icon="star" round clearer [(ngModel)]="name"></dui-input>
                    </p>

                    <p>
                        <dui-input icon="check" placeholder="Good job"></dui-input>
                    </p>

                    <p>
                        <dui-input type="textarea" placeholder="Hello There" />
                    </p>
                </div>
                <code-highlight lang="html" [code]="code" />
            </doc-code-frame>

            <api-doc component="InputComponent"></api-doc>
        </div>
    `,
})
export class DocDesktopUIInputComponent {
    name: string = 'Peter';

    code = `
    <dui-button-group>
        <dui-button textured [disabled]="name === ''" (click)="name = ''">clear</dui-button>
    </dui-button-group>

    <p>
        <dui-input placeholder="Username"></dui-input>
        default with placeholder
    </p>

    <p>
        <dui-input [(ngModel)]="name"></dui-input>
        default
    </p>

    <p>
      <dui-input clearer [disabled]="true" [(ngModel)]="name"></dui-input>
      disabled
    </p>

    <p>
        <dui-input clearer [(ngModel)]="name"></dui-input>
        clearer
    </p>

    <p>
        <dui-input textured [(ngModel)]="name"></dui-input>
        textured
    </p>

    <p>
        <dui-input round [(ngModel)]="name"></dui-input>
        round
    </p>

    <p>
        <dui-input round lightFocus [(ngModel)]="name"></dui-input>
        round lightFocus
    </p>
    <p>
        <dui-input round lightFocus semiTransparent [(ngModel)]="name"></dui-input>
        round lightFocus semiTransparent
    </p>

    <p>
        <dui-input icon="star" [(ngModel)]="name"></dui-input>
    </p>

    <p>
        <dui-input icon="star" round clearer [(ngModel)]="name"></dui-input>
    </p>

    <p>
        <dui-input icon="check" placeholder="Good job"></dui-input>
    </p>

    <p>
      <dui-input type="textarea" placeholder="Hello There"/>
    </p>
`;
}
