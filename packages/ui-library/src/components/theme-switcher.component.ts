import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
    DropdownComponent,
    DropdownItemComponent,
    DuiApp,
    IconComponent,
    OpenDropdownDirective,
} from '@deepkit/desktop-ui';

@Component({
    selector: 'dui-theme-switcher',
    template: `
        <dui-icon clickable name="color_theme" [openDropdown]="darkModeDropdown"></dui-icon>
        <dui-dropdown #darkModeDropdown>
            <dui-dropdown-item
                checkbox
                (click)="duiApp.setDarkMode(undefined)"
                [selected]="!duiApp.isDarkModeOverwritten()"
                >Auto</dui-dropdown-item
            >
            <dui-dropdown-item
                checkbox
                (click)="duiApp.setDarkMode(false)"
                [selected]="duiApp.isDarkModeOverwritten() && !duiApp.isDarkMode()"
                >Light
            </dui-dropdown-item>
            <dui-dropdown-item
                checkbox
                (click)="duiApp.setDarkMode(true)"
                [selected]="duiApp.isDarkModeOverwritten() && duiApp.isDarkMode()"
                >Dark
            </dui-dropdown-item>
        </dui-dropdown>
    `,
    host: {
        ['class.dui-normalized']: 'true',
    },
    styles: `
        :host {
            display: flex;
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IconComponent, DropdownComponent, DropdownItemComponent, OpenDropdownDirective],
})
export class ThemeSwitcherComponent {
    duiApp = inject(DuiApp);
}
