/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { DOCUMENT } from '@angular/common';
import {
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    Directive,
    ElementRef,
    Inject,
    Injectable,
    Injector,
    OnDestroy,
    Signal,
    Type,
    ViewContainerRef,
    input,
    model,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { isTargetChildOf } from '../../core/utils';
import { ButtonComponent, HotkeyDirective } from '../button/button.component';
import { InputComponent } from '../input/input.component';
import { WindowRegistry } from '../window/window-state';
import { CloseDialogDirective, DialogActionsComponent, DialogComponent } from './dialog.component';

@Component({
    template: `
        <h3>{{ title() || 'No title' }}</h3>
        @if (content()) {
            <div>{{ content() }}</div>
        }

        <dui-dialog-actions>
            <dui-button hotkey="escape" [closeDialog]="false">Cancel</dui-button>
            <dui-button auto-focus [closeDialog]="true">OK</dui-button>
        </dui-dialog-actions>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogActionsComponent, ButtonComponent, HotkeyDirective, CloseDialogDirective],
})
export class DuiDialogConfirm {
    title = input<string>('Confirm');
    content = input<string>('');

    static dialogDefaults = {
        maxWidth: '700px',
    };
}

@Component({
    template: `
        <h3>{{ title() || 'No title' }}</h3>
        @if (content()) {
            <div class="text-selection" style="white-space: pre-line;">{{ content() }}</div>
        }

        <dui-dialog-actions>
            <dui-button auto-focus hotkey="escape" [closeDialog]="true">OK</dui-button>
        </dui-dialog-actions>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogActionsComponent, ButtonComponent, HotkeyDirective, CloseDialogDirective],
})
export class DuiDialogAlert {
    title = input<string>('Alert');
    content = input<string>('');

    static dialogDefaults = {
        maxWidth: '700px',
    };
}

@Component({
    template: `
        <h3>{{ title() || 'No title' }}</h3>
        @if (content(); as content) {
            <div class="text-selection" style="white-space: pre-line;">{{ content }}</div>
        }
        <div style="padding-top: 5px;">
            <dui-input style="width: 100%" (enter)="dialog.close(value())" auto-focus [(ngModel)]="value"></dui-input>
        </div>

        <dui-dialog-actions>
            <dui-button hotkey="escape" [closeDialog]="false">Cancel</dui-button>
            <dui-button [closeDialog]="value()">OK</dui-button>
        </dui-dialog-actions>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        InputComponent,
        FormsModule,
        DialogActionsComponent,
        ButtonComponent,
        HotkeyDirective,
        CloseDialogDirective,
    ],
})
export class DuiDialogPrompt {
    title = input<string>('Alert');
    content = input<string>('');

    value = model<string>('');

    static dialogDefaults = {
        maxWidth: '700px',
    };

    constructor(public dialog: DialogComponent) {}
}

export type Inputs<T> = {
    [P in keyof T]?: T[P] extends Signal<infer V> ? V : T[P];
};

@Injectable({ providedIn: 'root' })
export class DuiDialog {
    constructor(
        protected app: ApplicationRef,
        protected injector: Injector,
        protected registry: WindowRegistry,
        protected overlay: Overlay,
    ) {}

    protected getComponentRef(viewContainerRef: ViewContainerRef | null = null): ComponentRef<DialogComponent> {
        if (!viewContainerRef && !this.registry.activeWindow) {
            //create portal
            const overlayRef = this.overlay.create();
            const portal = new ComponentPortal(DialogComponent);

            const comp = overlayRef.attach(portal);
            comp.instance.closed.subscribe(v => {
                comp.destroy();
                overlayRef.detach();
                overlayRef.dispose();
            });

            return comp;
        }

        if (!viewContainerRef) {
            viewContainerRef = this.registry.getCurrentViewContainerRef();
        }

        return viewContainerRef.createComponent(DialogComponent);
    }

    public open<T>(
        component: Type<T>,
        inputs: { [name in keyof T]?: any } = {},
        dialogInputs: Inputs<DialogComponent> = {},
        viewContainerRef: ViewContainerRef | null = null,
    ): { dialog: DialogComponent; close: Promise<any>; component: T } {
        const comp = this.getComponentRef(viewContainerRef);
        comp.setInput('visible', true);
        comp.setInput('component', component);
        comp.setInput('componentInputs', inputs);

        if ((component as any).dialogDefaults) {
            for (const [i, v] of Object.entries((component as any).dialogDefaults) as Array<[string, any]>) {
                comp.setInput(i, v);
            }
        }

        for (const [i, v] of Object.entries(dialogInputs)) {
            comp.setInput(i, v);
        }

        const close = new Promise(resolve => {
            comp.instance.closed.subscribe(v => {
                comp.destroy();
                resolve(v);
            });
        });

        comp.instance.show();

        return {
            dialog: comp.instance,
            close,
            component: comp.instance.wrapperComponentRef?.instance?.renderComponentDirective?.component?.instance,
        };
    }

    public async alert(title: string, content: string = '', inputs: { [name: string]: any } = {}): Promise<boolean> {
        const { dialog } = this.open(DuiDialogAlert, { title, content }, inputs);
        return dialog.toPromise();
    }

    public async confirm(title: string, content: string = '', inputs: { [name: string]: any } = {}): Promise<boolean> {
        const { dialog } = this.open(DuiDialogConfirm, { title, content }, inputs);
        return dialog.toPromise();
    }

    public async prompt(
        title: string,
        value: string,
        content?: string,
        inputs: { [name: string]: any } = {},
    ): Promise<false | string> {
        const { dialog } = this.open(DuiDialogPrompt, { title, value, content }, inputs);
        return dialog.toPromise();
    }
}

/**
 * Directive to show a confirmation dialog when the user clicks on the element.
 *
 * ```html
 * <dui-button confirm="Really delete?" (click)="delete()">Delete</dui-button>
 * ```
 */
@Directive({ selector: '[confirm]' })
export class DuiDialogConfirmDirective implements OnDestroy {
    /**
     * The confirm message to show when the user clicks on the element.
     *
     * Use `Title\nText` to specify a title and text, separated by a newline.
     */
    confirm = input.required<string>();

    protected ignoreNextClick = false;

    protected callback = async (event: MouseEvent) => {
        if (isTargetChildOf(event.target, this.element.nativeElement)) {
            if (this.ignoreNextClick) {
                this.ignoreNextClick = false;
                return;
            }

            event.stopPropagation();
            event.preventDefault();
            const confirm = this.confirm();
            const firstNewlineIndex = confirm.indexOf('\n');
            let title = '';
            let text = '';
            if (firstNewlineIndex !== -1) {
                title = confirm.substring(0, firstNewlineIndex);
                text = confirm.substring(firstNewlineIndex + 1);
            } else {
                title = confirm;
                text = '';
            }
            const a = await this.dialog.confirm(title, text, {});
            if (a) {
                this.ignoreNextClick = true;
                this.element.nativeElement.dispatchEvent(event);
            }
        }
    };

    constructor(
        protected element: ElementRef<HTMLElement>,
        protected dialog: DuiDialog,
        @Inject(DOCUMENT) protected document: any,
    ) {
        this.document.body?.addEventListener('click', this.callback, true);
    }

    ngOnDestroy() {
        this.document.body?.removeEventListener('click', this.callback, true);
    }
}
