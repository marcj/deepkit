import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { IconComponent, InputComponent } from '@deepkit/desktop-ui';

@Component({
    selector: 'icon-browser',
    template: `
        <dui-input
            [(ngModel)]="query"
            clearer
            round
            lightFocus
            icon="filter"
            (ngModelChange)="cd.detectChanges()"
            placeholder="Filter ..."
        ></dui-input>
        <div class="icons">
            @for (icon of filter(icons); track icon) {
                <div class="icon">
                    <dui-icon [name]="icon"></dui-icon>
                    <div class="name">{{ icon }}</div>
                </div>
            }
        </div>
    `,
    imports: [FormsModule, InputComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./icon-browser.component.scss'],
})
export class IconBrowserComponent implements OnInit {
    public icons?: any;

    public query = '';

    constructor(
        protected httpClient: HttpClient,
        public cd: ChangeDetectorRef,
    ) {}

    filter(value: string[]) {
        if (!this.query) return value;

        return value.filter(v => v.indexOf(this.query) !== -1);
    }

    async ngOnInit(): Promise<any> {
        if (this.icons === undefined) {
            this.icons = await this.httpClient.get('assets/fonts/icon-names.json').toPromise();
        }

        this.cd.detectChanges();
    }
}
