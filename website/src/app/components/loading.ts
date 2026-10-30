import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';

@Component({
    selector: 'app-loading',
    standalone: true,
    styles: [
        `
            div {
                overflow: hidden;
                position: absolute;
                top: 0;
                left: 0;
                width: 0;
                height: 2px;
                background: #0088cc;
                border-radius: 1px;
                transition:
                    width 1500ms ease-out,
                    opacity 1400ms linear;
            }

            div.fixed {
                position: fixed;
                z-index: 2147483647;
            }

            div.loading {
                width: 100%;
            }

            div dd,
            div dt {
                position: absolute;
                top: 0;
                height: 2px;
                box-shadow: #0088cc 1px 0 6px 1px;
                border-radius: 100%;
            }

            div dt {
                opacity: 0.6;
                width: 180px;
                right: -80px;
                clip: rect(-6px, 90px, 14px, -6px);
            }

            div dd {
                opacity: 0.6;
                width: 20px;
                right: 0;
                clip: rect(-6px, 22px, 14px, 10px);
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div [class.fixed]="fixed" [class.loading]="loading">
            <dt></dt>
            <dd></dd>
        </div>
    `,
})
export class LoadingComponent implements OnInit {
    @Input() fixed = true;

    loading = false;

    constructor(private cd: ChangeDetectorRef) {}

    ngOnInit() {
        setTimeout(() => {
            this.loading = true;
            this.cd.detectChanges();
        }, 10);
    }
}
