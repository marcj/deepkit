import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { IconComponent } from '@deepkit/desktop-ui';

@Component({
    selector: 'deepkit-box',
    template: `
        <div class="box">
            @if (title) {
                <div class="box-title" (click)="toggleOpen()">
                    <div>
                        @if (toggleAble) {
                            <dui-icon clickable [name]="open ? 'arrow_down' : 'arrow_right'"></dui-icon>
                        }
                        {{ title }}
                    </div>
                </div>
            }

            @if (open) {
                <ng-container>
                    <ng-content></ng-content>
                </ng-container>
            }
        </div>
    `,
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./box.component.scss'],
})
export class DeepkitBoxComponent {
    @Input() title: string = '';
    @Input() toggleAble: boolean = false;

    open = true;

    toggleOpen() {
        if (!this.toggleAble) return;
        this.open = !this.open;
    }
}
