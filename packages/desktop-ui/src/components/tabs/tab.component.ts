import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

@Component({
    selector: 'dui-tab',
    template: `
        <div class="content">
            <ng-content></ng-content>
        </div>
        @if (removable()) {
            <dui-icon class="closer" (click)="onClose()" clickable name="times"></dui-icon>
        }
    `,
    host: {
        '[class.active]': 'active()',
    },
    styleUrls: ['./tab.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IconComponent],
})
export class TabComponent {
    active = input<boolean>(false);
    removable = input<boolean>(true);

    close = output();

    protected onClose() {
        this.close.emit();
    }
}
