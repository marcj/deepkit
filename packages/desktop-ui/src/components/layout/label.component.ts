import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'dui-label',
    template: `
        <label>{{ label() }}</label>
        <ng-content></ng-content>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                user-select: text;
                margin-bottom: 18px;
                overflow: hidden;
                text-overflow: ellipsis;
                word-break: break-all;
            }

            label {
                display: block;
                color: var(--dui-text-light);
                margin-bottom: 6px;
                user-select: none;
            }
        `,
    ],
})
export class LabelComponent {
    label = input<string>('');
}

@Component({
    selector: 'dui-label-grid',
    template: ` <ng-content></ng-content> `,
    styles: [
        `
            :host {
                display: grid;
                gap: 15px;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        '[style.grid-template-columns]': `templateColumns`,
    },
})
export class LabelGridComponent {
    labelWidth = input<string | number>('150px');
    labelMaxWidth = input<string | number>('1fr');

    protected get templateColumns() {
        return `repeat(auto-fit, minmax(${this.labelWidth()}, ${this.labelMaxWidth()}))`;
    }
}
