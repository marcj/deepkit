import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import {
    DropdownComponent,
    DropdownItemComponent,
    DuiApp,
    IconComponent,
    OpenDropdownDirective,
} from '@deepkit/desktop-ui';
import { RpcWebSocketClient } from '@deepkit/rpc';

@Component({
    selector: 'deepkit-header-status-bar',
    template: `
        <div class="connection-info">
            @if (client().transporter.connection | async) {
                <div class="connected">Connected</div>
            } @else {
                <div class="disconnected">Disconnected</div>
            }
        </div>

        <dui-icon clickable name="color_theme" [openDropdown]="darkModeDropdown"></dui-icon>
        <dui-dropdown #darkModeDropdown>
            <dui-dropdown-item (click)="duiApp.setDarkMode(undefined)" [selected]="!duiApp.isDarkModeOverwritten()"
                >Auto</dui-dropdown-item
            >
            <dui-dropdown-item
                (click)="duiApp.setDarkMode(false)"
                [selected]="duiApp.isDarkModeOverwritten() && !duiApp.isDarkMode()"
                >Light
            </dui-dropdown-item>
            <dui-dropdown-item
                (click)="duiApp.setDarkMode(true)"
                [selected]="duiApp.isDarkModeOverwritten() && duiApp.isDarkMode()"
                >Dark
            </dui-dropdown-item>
        </dui-dropdown>
    `,
    imports: [AsyncPipe, IconComponent, OpenDropdownDirective, DropdownComponent, DropdownItemComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: flex;
                align-items: center;
            }

            .connection-info {
                margin-right: 3px;
                font-size: 10px;
                text-transform: uppercase;
            }

            .connected {
                color: var(--dui-color-green);
            }

            .disconnected {
                color: var(--dui-color-red);
            }
        `,
    ],
})
export class HeaderStatusBarComponent {
    client = input.required<RpcWebSocketClient>();

    constructor(public duiApp: DuiApp) {}
}
