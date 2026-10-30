import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from '@angular/core';
import { injectLocalStorageNumber, injectLocalStorageString } from '@app/app/utils.js';

import {
    DropdownComponent,
    DropdownItemComponent,
    DropdownSplitterComponent,
    DuiApp,
    IconComponent,
    OpenDropdownDirective,
} from '@deepkit/desktop-ui';

@Injectable({ providedIn: 'root' })
export class ContentTextService {
    fontFamily = injectLocalStorageString('style/font-family2', { defaultValue: 'sans-serif' });
    fontSize = injectLocalStorageNumber('style/font-size2', { defaultValue: 0 });
    theme = injectLocalStorageString('style/theme2', { defaultValue: 'dark' });
    darkMode = computed(() => this.theme() === 'dark');

    toc = injectLocalStorageString('style/toc', { defaultValue: '' });

    tocVisible = computed(() => this.toc() === '');

    disableDarkModeSetting = signal(false);

    constructor(private duiApp: DuiApp) {
        effect(() => {
            if (this.disableDarkModeSetting()) return;
            this.duiApp.setDarkMode(this.darkMode());
        });
    }
}

@Component({
    selector: 'dui-content-text',
    host: {
        '[class.content-text]': 'true',
        '[class.normalize-text]': 'true',
        '[class.content-text-sans-serif]': 'contentTextService.fontFamily() === "sans-serif"',
        '[class.dark]': 'contentTextService.darkMode()',
        '[class.font-size-very-small]': 'contentTextService.fontSize() === -2',
        '[class.font-size-small]': 'contentTextService.fontSize() === -1',
        '[class.font-size-normal]': 'contentTextService.fontSize() === 0',
        '[class.font-size-large]': 'contentTextService.fontSize() === 1',
        '[class.font-size-very-large]': 'contentTextService.fontSize() === 2',
    },
    template: `
        <div class="style">
            <dui-icon clickable name="font" [openDropdown]="dropdownFont" />
            <dui-dropdown #dropdownFont>
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontFamily.set('')"
                    [selected]="contentTextService.fontFamily() === ''"
                    >Serif</dui-dropdown-item
                >
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontFamily.set('sans-serif')"
                    [selected]="contentTextService.fontFamily() === 'sans-serif'"
                    >Sans-serif</dui-dropdown-item
                >
                <dui-dropdown-separator />
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontSize.set(-2)"
                    [selected]="contentTextService.fontSize() === -2"
                    >Very small</dui-dropdown-item
                >
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontSize.set(-1)"
                    [selected]="contentTextService.fontSize() === -1"
                    >Small</dui-dropdown-item
                >
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontSize.set(0)"
                    [selected]="contentTextService.fontSize() === 0"
                    >Normal</dui-dropdown-item
                >
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontSize.set(1)"
                    [selected]="contentTextService.fontSize() === 1"
                    >Large</dui-dropdown-item
                >
                <dui-dropdown-item
                    checkbox
                    (click)="contentTextService.fontSize.set(2)"
                    [selected]="contentTextService.fontSize() === 2"
                    >Very large</dui-dropdown-item
                >
                <dui-dropdown-separator />
                <dui-dropdown-item checkbox (click)="toggleToc()" [selected]="contentTextService.tocVisible()"
                    >Table Of Contents</dui-dropdown-item
                >
            </dui-dropdown>
            <dui-icon clickable name="color_theme" (click)="toggleDark()"></dui-icon>
        </div>
        <ng-content />
    `,
    imports: [
        IconComponent,
        DropdownComponent,
        DropdownItemComponent,
        OpenDropdownDirective,
        DropdownSplitterComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: block;
            margin: auto;
            line-height: 1.75;
        }

        .style {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 4px;
        }

        :host.font-size-very-small {
            font-size: 10px;
        }

        :host.font-size-small {
            font-size: 12px;
        }

        :host.font-size-normal {
            font-size: 14px;
        }

        :host.font-size-large {
            font-size: 16px;
        }

        :host.font-size-very-large {
            font-size: 18px;
        }
    `,
})
export class ContentTextComponent {
    contentTextService = inject(ContentTextService);

    toggleDark() {
        if (this.contentTextService.theme() === 'dark') {
            this.contentTextService.theme.set('');
        } else {
            this.contentTextService.theme.set('dark');
        }
    }

    toggleToc() {
        if (this.contentTextService.toc() === 'hidden') {
            this.contentTextService.toc.set('');
        } else {
            this.contentTextService.toc.set('hidden');
        }
    }
}
