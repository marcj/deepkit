import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppTitle } from '@app/app/components/title.js';

import {
    ButtonComponent,
    CheckboxComponent,
    FormComponent,
    FormRowComponent,
    IconComponent,
    InputComponent,
    OptionDirective,
    SelectBoxComponent,
} from '@deepkit/desktop-ui';

@Component({
    imports: [
        FormComponent,
        FormRowComponent,
        InputComponent,
        CheckboxComponent,
        FormsModule,
        SelectBoxComponent,
        OptionDirective,
        ButtonComponent,
        IconComponent,
        AppTitle,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="app-pre-headline">Desktop UI</div>
        <h1>Form</h1>
        <app-title value="Form"></app-title>

        <dui-form style="max-width: 450px;" [disabled]="disabledAll">
            <dui-form-row label="Username">
                <dui-input [disabled]="disabled" clearer></dui-input>
            </dui-form-row>

            <dui-form-row label="Name">
                <dui-input placeholder="Your full name"></dui-input>
            </dui-form-row>

            <dui-form-row label="Nope">
                <dui-input [disabled]="true" placeholder="Disabled"></dui-input>
            </dui-form-row>

            <dui-form-row label="Textured">
                <dui-input textured round placeholder="and round"></dui-input>
            </dui-form-row>

            <dui-form-row label="Really?">
                <dui-checkbox>Checkbox A</dui-checkbox>
            </dui-form-row>

            <dui-form-row label="Which one">
                <dui-radiobox [(ngModel)]="radioValue" value="a">Radio A</dui-radiobox>
                <br />
                <dui-radiobox [(ngModel)]="radioValue" value="b">Radio B</dui-radiobox>
                <p>Chosen: {{ radioValue }}</p>
            </dui-form-row>

            <dui-form-row label="Search">
                <dui-input icon="search" round clearer></dui-input>
            </dui-form-row>

            <dui-form-row label="Another one">
                <dui-select [(ngModel)]="radioValue" placeholder="Please choose">
                    <dui-option value="a">Option A</dui-option>
                    <dui-option value="b">Option B</dui-option>
                </dui-select>
            </dui-form-row>

            <dui-form-row label="Empty">
                <dui-select style="width: 100px;" [(ngModel)]="selectBox1" placeholder="Please choose">
                    <dui-option value="x">Option X</dui-option>
                    <dui-option value="y">Option Y</dui-option>
                </dui-select>
            </dui-form-row>

            <dui-form-row label="Textured">
                <dui-select textured [(ngModel)]="radioValue" placeholder="Please choose">
                    <dui-option value="a">Option A</dui-option>
                    <dui-option value="b">Option B</dui-option>
                </dui-select>
            </dui-form-row>

            <dui-form-row label="">
                <dui-button (click)="i = i + 1">
                    <dui-icon name="star"></dui-icon>
                    Button
                </dui-button>
                {{ i }}
            </dui-form-row>

            <dui-form-row label="">
                <dui-button textured>Textured Button</dui-button>
            </dui-form-row>

            <dui-form-row label="">
                <dui-button square>Square button</dui-button>
            </dui-form-row>

            <dui-form-row label="">
                <dui-checkbox [(ngModel)]="disabledAll" [disabled]="true">Disabled</dui-checkbox>
            </dui-form-row>
        </dui-form>

        <dui-form-row label="">
            <dui-checkbox [(ngModel)]="disabledAll">Disable all</dui-checkbox>
        </dui-form-row>


    `,
})
export class DocDesktopUIFormComponent {
    disabled = false;
    disabledAll = false;
    i = 0;
    radioValue?: string;
    selectBox1?: string;
}
