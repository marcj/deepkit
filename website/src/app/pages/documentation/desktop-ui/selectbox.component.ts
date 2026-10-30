import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { CodeFrameComponent } from '@app/app/pages/documentation/desktop-ui/code-frame.component.js';

import { ButtonComponent, DynamicOptionDirective, OptionDirective, SelectBoxComponent } from '@deepkit/desktop-ui';
import { CodeHighlightComponent } from '@deepkit/ui-library';

@Component({
    imports: [
        CodeHighlightComponent,
        CodeFrameComponent,
        SelectBoxComponent,
        OptionDirective,
        FormsModule,
        DynamicOptionDirective,
        ButtonComponent,
        ApiDocComponent,
        AppTitle,
    ],
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>Select</h1>
            <app-title value="Select Box"></app-title>

            <doc-code-frame>
                <div class="examples">
                    <div>
                        <dui-select [(ngModel)]="value" placeholder="Please choose">
                            <dui-option value="a">Option A</dui-option>
                            <dui-option value="b">Option B</dui-option>
                            <dui-option value="c">Option C</dui-option>
                        </dui-select>
                        <dui-select small [(ngModel)]="value" placeholder="Please choose">
                            <dui-option value="a">Option A</dui-option>
                            <dui-option value="b">Option B</dui-option>
                            <dui-option value="c">Option C</dui-option>
                        </dui-select>
                    </div>
                    <dui-select [(ngModel)]="value" textured placeholder="Please choose">
                        <dui-option value="a">Option A</dui-option>
                        <dui-option value="b">Option B</dui-option>
                        <dui-option value="c">Option C</dui-option>
                    </dui-select>
                    <dui-select [disabled]="true" [(ngModel)]="value" textured placeholder="Please choose">
                        <dui-option value="a">Option A</dui-option>
                        <dui-option value="b">Option B</dui-option>
                        <dui-option value="c">Option C</dui-option>
                    </dui-select>
                    <dui-select small [(ngModel)]="value" textured placeholder="Please choose">
                        <dui-option value="a">Option A</dui-option>
                        <dui-option value="b">Option B</dui-option>
                        <dui-option value="c">Option C</dui-option>
                    </dui-select>
                    <p>Chosen: {{ value() }}</p>
                    <div>
                        <dui-select [(ngModel)]="value" placeholder="Please choose">
                            <dui-option value="a">
                                <ng-container *dynamicOption> Option A </ng-container>
                            </dui-option>
                            <dui-option value="b">
                                <ng-container *dynamicOption> Option B </ng-container>
                            </dui-option>
                            <dui-option value="c">
                                <ng-container *dynamicOption> Option CCCCCCCCCC </ng-container>
                            </dui-option>
                        </dui-select>
                    </div>
                    <div>
                        <dui-select [(ngModel)]="value">
                            <dui-button textured (click)="value.set('')">Reset</dui-button>
                            <dui-option value="a">Option A</dui-option>
                            <dui-option value="b">Option B</dui-option>
                            <dui-option value="c">Option C</dui-option>
                        </dui-select>
                    </div>
                    <div>
                        <dui-select placeholder="Many items">
                            @for (item of manyItems; track item) {
                                <dui-option [value]="item">Option #{{ item }}</dui-option>
                            }
                        </dui-select>
                    </div>
                </div>
                <code-highlight lang="html" [code]="code" />
            </doc-code-frame>

            <api-doc component="SelectBoxComponent"></api-doc>
            <api-doc component="OptionDirective"></api-doc>
            <api-doc component="OptionSeparatorDirective"></api-doc>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        .examples > div {
            margin-bottom: 14px;
        }
    `,
})
export class DocDesktopUISelectboxComponent {
    manyItems = [...Array(255).keys()].map(x => x + 1);
    value = signal('a');

    code = `
<p>
  <dui-select [(ngModel)]="value" placeholder="Please choose">
    <dui-option value="a">Option A</dui-option>
    <dui-option value="b">Option B</dui-option>
    <dui-option value="c">Option C</dui-option>
  </dui-select>
  <dui-select small [(ngModel)]="value" placeholder="Please choose">
    <dui-option value="a">Option A</dui-option>
    <dui-option value="b">Option B</dui-option>
    <dui-option value="c">Option C</dui-option>
  </dui-select>
</p>
<dui-select [(ngModel)]="value" textured placeholder="Please choose">
  <dui-option value="a">Option A</dui-option>
  <dui-option value="b">Option B</dui-option>
  <dui-option value="c">Option C</dui-option>
</dui-select>
<dui-select [disabled]="true" [(ngModel)]="value" textured placeholder="Please choose">
  <dui-option value="a">Option A</dui-option>
  <dui-option value="b">Option B</dui-option>
  <dui-option value="c">Option C</dui-option>
</dui-select>
<dui-select small [(ngModel)]="value" textured placeholder="Please choose">
  <dui-option value="a">Option A</dui-option>
  <dui-option value="b">Option B</dui-option>
  <dui-option value="c">Option C</dui-option>
</dui-select>
<p>
  Chosen: {{"{{"}}value{{"}}"}}
</p>
<dui-select [(ngModel)]="value" placeholder="Please choose">
  <dui-option value="a">
    <ng-container *dynamicOption>
      <dui-emoji name="slightly_smiling_face"></dui-emoji>
      Option A
    </ng-container>
  </dui-option>
  <dui-option value="b">
    <ng-container *dynamicOption>
      <dui-emoji name="sunglasses"></dui-emoji>
      Option B
    </ng-container>
  </dui-option>
  <dui-option value="c">
    <ng-container *dynamicOption>
      Option CCCCCCCCCC
    </ng-container>
  </dui-option>
</dui-select>
<p>
  <dui-select [(ngModel)]="value">
    <dui-button textured (click)="value = ''">Reset</dui-button>
    <dui-option value="a">Option A</dui-option>
    <dui-option value="b">Option B</dui-option>
    <dui-option value="c">Option C</dui-option>
  </dui-select>
</p>
<p>
  <dui-select placeholder="Many items">
    <dui-option *ngFor="let item of manyItems" [value]="item">Option #{{"{{"}}item{{"}}"}}</dui-option>
  </dui-select>
</p>
</code-highlight>
`;
}
