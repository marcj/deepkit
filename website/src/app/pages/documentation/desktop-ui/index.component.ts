import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ContentTextComponent } from '@app/app/components/content-text.component.js';
import { AppTitle } from '@app/app/components/title.js';

@Component({
    imports: [RouterOutlet, AppTitle, ContentTextComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <app-title value="Desktop UI"></app-title>

        <dui-content-text style="text-align: left;">
            <router-outlet />
        </dui-content-text>
    `,
})
export class DesktopUIIndexComponent {}
