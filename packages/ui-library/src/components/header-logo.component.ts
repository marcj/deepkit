import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
    selector: 'deepkit-header-logo',
    template: `
        <div style="position: relative; top: -2px;">
            <img class="logo visible-for-dark-mode" src="assets/deepkit_white.svg" />
            <img class="logo visible-for-white-mode" theme-white src="assets/deepkit_black.svg" />
            <span style="margin-left: 8px; display: inline-block; color: var(--dui-text-grey)">{{ title }}</span>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            .logo {
                width: 16px;
                vertical-align: text-bottom;
                margin-left: 4px;
            }
        `,
    ],
})
export class HeaderLogoComponent {
    @Input() title!: string;
}
