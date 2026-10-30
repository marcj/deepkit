/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { KeyValuePipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ContentChild,
    HostListener,
    SkipSelf,
    booleanAttribute,
    input,
    output,
    signal,
} from '@angular/core';
import { FormGroup, FormsModule, NgControl, ReactiveFormsModule } from '@angular/forms';

@Component({
    selector: 'dui-form-row',
    template: ` <div class="label" [style.width.px]="labelWidth()">
            {{ label() }}
            @if (description()) {
                <div class="description">{{ description() }}</div>
            }
        </div>
        <div class="field">
            <ng-content></ng-content>

            @if (ngControl && ngControl.errors && ngControl.touched) {
                <div class="error">
                    @for (kv of ngControl.errors | keyvalue; track kv) {
                        <div>{{ isString(kv.value) ? '' : kv.key }}{{ isString(kv.value) ? kv.value : '' }}</div>
                    }
                </div>
            }
        </div>`,
    host: {
        '[class.left-aligned]': 'left()',
    },
    styleUrls: ['./form-row.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [KeyValuePipe],
})
export class FormRowComponent {
    label = input<string>('');
    description = input<string>('');

    labelWidth = input<number>();
    left = input(false, { transform: booleanAttribute });

    @ContentChild(NgControl, { static: false }) ngControl?: NgControl;

    isString(v: any) {
        return 'string' === typeof v;
    }
}

@Component({
    selector: 'dui-form',
    template: `
        <form [formGroup]="formGroup()" (submit)="$event.preventDefault(); submitForm()">
            <ng-content></ng-content>
            @if (errorText(); as text) {
                <div class="error">{{ text }}</div>
            }
        </form>
    `,
    styleUrls: ['./form.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, ReactiveFormsModule],
})
export class FormComponent {
    formGroup = input<FormGroup>(new FormGroup({}));

    disabled = input<boolean>(false);

    submit = input<() => Promise<any> | any>();

    success = output();
    error = output();

    errorText = signal('');
    submitting = signal(false);

    constructor(
        protected cd: ChangeDetectorRef,
        @SkipSelf() protected cdParent: ChangeDetectorRef,
    ) {}

    @HostListener('keyup', ['$event'])
    onEnter(event: KeyboardEvent) {
        if (
            this.submit() &&
            event.key.toLowerCase() === 'enter' &&
            event.target &&
            (event.target as HTMLElement).tagName.toLowerCase() === 'input'
        ) {
            this.submitForm();
        }
    }

    get invalid() {
        return this.formGroup().invalid;
    }

    async submitForm() {
        if (this.disabled()) return;
        if (this.submitting()) return;
        const formGroup = this.formGroup();
        if (formGroup.invalid) return;
        this.errorText.set('');

        this.submitting.set(true);

        try {
            const submit = this.submit();
            if (submit) {
                try {
                    await submit();
                    this.success.emit();
                } catch (error: any) {
                    this.error.emit(error);

                    if (error.errors && error.errors[0]) {
                        //we got a validation-like error object
                        for (const item of error.errors) {
                            const control = formGroup.get(item.path);
                            if (control) {
                                control.setErrors({
                                    ...control.errors,
                                    [item.code]: item.message,
                                });
                            }
                        }
                    } else {
                        this.errorText.set(error.message || error);
                    }
                }
            }
        } finally {
            this.submitting.set(false);
        }
    }
}
