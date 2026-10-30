import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'dui-tabs',
    template: ` <ng-content></ng-content>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./tabs.component.scss'],
})
export class TabsComponent {}
