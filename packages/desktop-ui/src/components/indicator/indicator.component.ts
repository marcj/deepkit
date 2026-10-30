/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnChanges, OnDestroy, input } from '@angular/core';
import { Subscription } from 'rxjs';

import { ProgressTracker } from '@deepkit/core-rxjs';

import { ButtonComponent } from '../button/button.component';
import { DialogActionsComponent } from '../dialog/dialog.component';

@Component({
    selector: 'dui-indicator',
    template: ` <div [class.invisible]="step() <= 0" [style.width.%]="step() * 100" class="active"></div> `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./indicator.component.scss'],
})
export class IndicatorComponent {
    step = input<number>(0);
}

@Component({
    selector: 'dui-progress-indicator',
    styles: [
        `
            .indicator {
                display: inline-flex;
                align-items: center;
                opacity: 1;
                transition: opacity 0.3s ease-in-out;
            }

            .indicator.vertical {
                flex-direction: column;
                align-items: flex-start;
            }

            .label {
                padding-left: 4px;
            }

            .percentage {
                display: inline-block;
                width: 55px;
                text-align: right;
            }

            .hide {
                opacity: 0;
            }
        `,
    ],
    template: `
        @if (progressTracker(); as progressTracker) {
            @if (title()) {
                <h2>{{ title() }}</h2>
            }

            @if (description()) {
                <p>{{ description() }}</p>
            }

            <ng-content />

            <div class="indicator" [class.vertical]="display() === 'vertical'" [class.hide]="progressTracker.ended">
                <dui-indicator [step]="step"></dui-indicator>
                @if (progressTracker.current; as group) {
                    <div class="label">
                        <span class="percentage text-light text-tabular"
                            >{{ progressTracker.progress * 100 | number: '0.2-2' }}%</span
                        >
                        - {{ group.message }}
                    </div>
                }
            </div>

            <dui-dialog-actions>
                <dui-button textured (click)="progressTracker.stop()">Stop</dui-button>
            </dui-dialog-actions>
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        IndicatorComponent,
        DecimalPipe,
        DialogActionsComponent,
        ButtonComponent,
        DialogActionsComponent,
        ButtonComponent,
    ],
})
export class ProgressIndicatorComponent implements OnChanges, OnDestroy {
    title = input<string>('Progress');
    description = input<string>('');

    progressTracker = input<ProgressTracker>();
    display = input<'horizontal' | 'vertical'>('horizontal');

    step: number = 0;
    sub?: Subscription;

    constructor(private cd: ChangeDetectorRef) {}

    ngOnChanges(): void {
        if (this.sub) this.sub.unsubscribe();
        const progressTracker = this.progressTracker();
        if (progressTracker) {
            this.sub = progressTracker.subscribe(v => {
                this.step = this.progressTracker()!.progress;
                this.cd.detectChanges();
            });
        }
    }

    ngOnDestroy(): void {
        if (this.sub) this.sub.unsubscribe();
    }
}
