/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { AfterViewInit, booleanAttribute, Component, computed, ElementRef, inject, input, LOCALE_ID, output, viewChild } from '@angular/core';
import { ngValueAccessor, ValueAccessorBase } from '../../core/form';
import { formatDate } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { FormsModule } from '@angular/forms';
import { DuiDocument } from '../document';

const dateTimeTypes: string[] = ['time', 'date', 'datetime', 'datetime-local'];

@Component({
    selector: 'dui-input',
    template: `
      @if (icon(); as icon) {
        <dui-icon class="icon" [size]="iconSize()" [name]="icon"></dui-icon>
      }
      @if (type() === 'textarea') {
        <textarea
          #input
          [readOnly]="readonly()"
          [placeholder]="placeholder()" (keyup)="onKeyUp($event)" (keydown)="onKeyDown($event)"
          (focus)="focus.emit($event)" (blur)="blur.emit($event)"
          [disabled]="isDisabled"
          [ngModel]="normalizeValue()" (ngModelChange)="setValue($event)"></textarea>
      } @else {
        @if (type() !== 'textarea') {
          <input
            #input
            [name]="name()"
            [step]="step()"
            [readOnly]="readonly()"
            [attr.min]="min()"
            [attr.max]="max()"
            [attr.minLength]="minLength()"
            [attr.maxLength]="maxLength()"
            [type]="type()"
            (change)="handleFileInput($event)"
            [placeholder]="placeholder()"
            (keyup)="onKeyUp($event)" (keydown)="onKeyDown($event)"
            (focus)="focus.emit($event)" (blur)="blur.emit($event)"
            [disabled]="isDisabled"
            [ngModel]="type() === 'file' ? undefined : normalizeValue()"
            (ngModelChange)="setValue($event)"
          />
        }
      }
      @if (clearer() && !disabled()) {
        <dui-icon class="clearer" name="clear" (click)="clear()"></dui-icon>
      }
    `,
    styleUrls: ['./input.component.scss'],
    host: {
        '[class.is-textarea]': 'type() === "textarea"',
        '[class.light-focus]': 'lightFocus()',
        '[class.focus-outline]': '!lightFocus()',
        '[class.semi-transparent]': 'semiTransparent()',
        '[class.no-controls]': 'noControls()',
        '[class.has-clearer]': 'clearer()',
        '[class.filled]': 'value()',
        '[class.round]': 'round()',
        '[class.textured]': 'textured()',
        '[class.has-icon]': 'icon()',
        '[class.focused]': 'isFocused()',
    },
    providers: [ngValueAccessor(InputComponent)],
    imports: [IconComponent, FormsModule],
})
export class InputComponent extends ValueAccessorBase<any> implements AfterViewInit {
    type = input<string>('text');

    step = input<number>(1);

    placeholder = input<string>('');

    name = input<string>('');
    icon = input<string>('');

    min = input<number>();
    max = input<number>();
    maxLength = input<number>();
    minLength = input<number>();

    iconSize = input<number>(17);

    /**
     * Focuses this element once created (AfterViewInit).
     */
    autoFocus = input(false, { alias: 'auto-focus', transform: booleanAttribute });

    /**
     * Uses a more decent focus border.
     */
    lightFocus = input(false, { transform: booleanAttribute });

    /**
     * Disables input controls (like for type=number the arrow buttons)
     */
    noControls = input(false, { transform: booleanAttribute });

    /**
     * Appears a little bit transparent. Perfect for blurry background.
     */
    semiTransparent = input(false, { transform: booleanAttribute });

    esc = output<KeyboardEvent>();
    enter = output<KeyboardEvent>();
    keydown = output<KeyboardEvent>();
    keyup = output<KeyboardEvent>();
    blur = output<FocusEvent>();
    focus = output<FocusEvent>();

    input = viewChild('input', { read: ElementRef });

    textured = input(false, { transform: booleanAttribute });

    readonly = input(false, { transform: booleanAttribute });

    protected duiDocument = inject(DuiDocument);
    protected locale = inject(LOCALE_ID);

    isFocused = computed(() => this.duiDocument.activeElement() === this.input()?.nativeElement);

    round = input(false, { transform: booleanAttribute });

    clearer = input(false, { transform: booleanAttribute });

    protected normalizeValue = computed(() => {
        if (dateTimeTypes.includes(this.type())) {
            if (this.value() instanceof Date) {
                if (this.type() === 'date') return formatDate(this.value(), `yyyy-MM-dd`, this.locale);
                return formatDate(this.value(), 'yyyy-MM-ddTHH:mm:ss.SSS', this.locale);
            } else if ('string' === typeof this.value()) {
                return formatDate(new Date(this.value()), 'yyyy-MM-ddTHH:mm:ss.SSS', this.locale);
            }
        }
        return this.value();
    });


    constructor() {
        super();
        this.value.set('');
    }

    clear() {
        this.setValue('');
    }

    setValue(value: any | undefined) {
        if (this.type() === 'file' && !value && this.input) {
            //we need to manually reset the field, since writing to it via ngModel is not supported.
            const input = this.input();
            if (input) input.nativeElement.value = '';
        }

        value = value === undefined || value === null ? '' : value;

        if (this.type() === 'file') return;
        if (this.type() === 'text') {

        } else if (this.type() === 'number') {
            if (value && 'number' !== typeof value) {
                value = parseFloat(value);
            }
        } else if (dateTimeTypes.includes(this.type())) {
            if ('string' === typeof value) {
                value = new Date(value);
            }
        }
        super.setValue(value);
    }

    protected onKeyDown(event: KeyboardEvent) {
        this.touch();
        this.keydown.emit(event);
    }

    protected onKeyUp(event: KeyboardEvent) {
        if (event.key.toLowerCase() === 'enter' && this.type() !== 'textarea') {
            this.enter.emit(event);
        }

        if (event.key.toLowerCase() === 'esc' || event.key.toLowerCase() === 'escape') {
            this.esc.emit(event);
        }

        this.keyup.emit(event);
    }

    focusInput() {
        setTimeout(() => {
            const input = this.input();
            if (input) input.nativeElement.focus();
        });
    }

    ngAfterViewInit() {
        if (this.autoFocus() && this.input()) {
            this.focusInput();
        }
    }

    protected async handleFileInput(event: any) {
        const files = event.target.files;
        this.touch();

        const readFile = (file: File): Promise<ArrayBuffer | undefined> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    if (reader.result) {
                        if (reader.result instanceof ArrayBuffer) {
                            resolve(reader.result);
                        } else {
                            resolve(undefined);
                        }
                    }
                };
                reader.onerror = (error) => {
                    console.log('Error: ', error);
                    reject();
                };

                reader.readAsArrayBuffer(file);
            });
        };

        if (files) {
            if (files.length > 1) {
                const value: any[] = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files.item(i);
                    if (file) {
                        value.push(await readFile(file));
                    }
                }
                this.setValue(value);
            } else if (files.length === 1) {
                this.setValue(await readFile(files.item(0)));
            }
        }
    }
}
