/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostBinding,
    OnDestroy,
    OnInit,
    TemplateRef,
    ViewChild,
    forwardRef,
    inject,
    input,
} from '@angular/core';

import { Electron } from '../../core/utils';
import { IconComponent } from '../icon/icon.component';
import { WinHeader, WindowState } from './window-state';

@Component({
    selector: 'dui-window-header',
    template: `
        <div class="title">
            <ng-content></ng-content>
            <div class="closer">
                <div (click)="minimize()">
                    <dui-icon [size]="18" name="gnome_minimize"></dui-icon>
                </div>
                <div (click)="maximize()">
                    <dui-icon [size]="18" name="gnome_maximize"></dui-icon>
                </div>
                <div (click)="close()" class="highlight">
                    <dui-icon [size]="18" name="gnome_close"></dui-icon>
                </div>
            </div>
        </div>
        @if (windowState.toolbars()['default']) {
            <div class="toolbar">
                <dui-window-toolbar-container></dui-window-toolbar-container>
            </div>
        }
    `,
    host: {
        ngSkipHydration: 'true',
        '[class.inactive]': '!windowState.focus()',
        '[class.size-default]': `size() === 'default'`,
        '[class.size-small]': `size() === 'small'`,
    },
    styleUrls: ['./window-header.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IconComponent, forwardRef(() => WindowToolbarContainerComponent)],
})
export class WindowHeaderComponent implements WinHeader {
    public size = input<'small' | 'default'>('default');

    @HostBinding('class.with-toolbar')
    protected get withToolbar() {
        return this.windowState.toolbars()['default']?.length;
    }

    constructor(
        public windowState: WindowState,
        protected element: ElementRef,
    ) {
        this.windowState = windowState;
    }

    getBottomPosition(): number {
        const rect = this.element.nativeElement.getBoundingClientRect();
        return rect.y + rect.height;
    }

    maximize() {
        const win = Electron.getRemote().BrowserWindow.getFocusedWindow();
        if (!win.isMaximized()) {
            Electron.getRemote().BrowserWindow.getFocusedWindow().maximize();
        } else {
            Electron.getRemote().BrowserWindow.getFocusedWindow().unmaximize();
        }
    }

    minimize() {
        Electron.getRemote().BrowserWindow.getFocusedWindow().minimize();
    }

    close() {
        Electron.getRemote().BrowserWindow.getFocusedWindow().close();
    }
}

@Component({
    selector: 'dui-window-toolbar',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <ng-template #templateRef>
            <ng-content></ng-content>
        </ng-template>
    `,
})
export class WindowToolbarComponent implements OnDestroy, OnInit {
    for = input<string>('default');
    @ViewChild('templateRef', { static: true }) template?: TemplateRef<any>;

    constructor(protected windowState: WindowState) {}

    ngOnInit() {
        if (!this.template) return;
        this.windowState.addToolbarContainer(this.for(), this.template);
    }

    ngOnDestroy(): void {
        if (!this.template) return;
        this.windowState.removeToolbarContainer(this.for(), this.template);
    }
}

@Component({
    selector: 'dui-window-toolbar-container',
    template: `
        @if (windowState.toolbars()[name()]; as toolbars) {
            @for (template of toolbars; track $index) {
                @if (template) {
                    <ng-container [ngTemplateOutlet]="template" [ngTemplateOutletContext]="{}"></ng-container>
                }
            }
        }
    `,
    styles: [
        `
            :host {
                display: flex;
                flex-direction: row;
                gap: 6px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgTemplateOutlet],
})
export class WindowToolbarContainerComponent {
    name = input<string>('default');
    windowState = inject(WindowState);
}
