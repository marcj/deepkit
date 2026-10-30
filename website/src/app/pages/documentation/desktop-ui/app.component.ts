import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppTitle } from '@app/app/components/title';

@Component({
    host: { ngSkipHydration: 'true' },
    imports: [AppTitle],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-content normalize-text">
            <div class="app-pre-headline">Desktop UI</div>
            <h1>App</h1>
            <app-title value="App"></app-title>

            <p>
                The service <code>DuiApp</code> allows to set some global application settings, such as the theme, dark
                mode, etc.
            </p>

        </div>
    `,
})
export class DocDesktopUIAppComponent {
    code = `
    `;
}
