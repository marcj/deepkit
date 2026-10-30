import { Component } from '@angular/core';
import { IndicatorComponent, SliderComponent } from '@deepkit/desktop-ui';
import { ApiDocComponent } from '@app/app/pages/documentation/desktop-ui/api-doc.component.js';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';

@Component({
    imports: [
        IndicatorComponent,
        ApiDocComponent,
        SliderComponent,
        FormsModule,
        AppTitle,
    ],
    template: `
      <div class="app-content normalize-text">
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Indicator</h1>
        <app-title value="Indicator"></app-title>

        <dui-indicator [step]="progress"></dui-indicator>
        {{ progress }}<br />
        <dui-indicator [step]="0.2"></dui-indicator>
        <br />
        <dui-indicator [step]="1"></dui-indicator>
        <br />
        <dui-indicator [step]="0"></dui-indicator>
        <br />

        <p>
          <dui-slider [(ngModel)]="progress"></dui-slider>
        </p>

        <api-doc component="IndicatorComponent"></api-doc>
      </div>
    `,
})
export class DocDesktopUIIndicatorComponent {
    progress = 0.5;
}
