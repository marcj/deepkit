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
    TemplateRef,
    booleanAttribute,
    effect,
    input,
    model,
    signal,
    viewChild,
} from '@angular/core';

import { triggerResize } from '../../core/utils';
import { clamp } from '../app/utils';
import { SplitterComponent } from '../splitter/splitter.component';
import { WindowState } from './window-state';

export interface WinSidebar {
    template: TemplateRef<any>;
}

@Component({
    selector: 'dui-window-content',
    template: `
        <div class="top-line"></div>

        <div class="content {{ class() }}" #content>
            <ng-content></ng-content>
        </div>

        @if (toolbar(); as toolbar) {
            <div
                class="sidebar"
                (transitionend)="transitionEnded()"
                #sidebar
                [class.hidden]="!sidebarVisible()"
                [class.with-animation]="withAnimation()"
                [style.min-width.px]="sidebarVisible() && !withAnimation() ? sidebarMinWidth() : undefined"
                [style.max-width.px]="sidebarMaxWidth()"
                [style.width.px]="sidebarWidth()"
            >
                <div
                    class="sidebar-container overlay-scrollbar-small"
                    [style.width.px]="sidebarWidth()"
                    #sidebarContainer
                >
                    <ng-container [ngTemplateOutlet]="toolbar.template" [ngTemplateOutletContext]="{}"></ng-container>
                </div>
                @if (sidebarVisible()) {
                    <dui-splitter
                        position="right"
                        [element]="sidebar"
                        property="width"
                        [(size)]="sidebarWidth"
                    ></dui-splitter>
                }
            </div>
        }
    `,
    host: {
        '[class.transparent]': 'transparent()',
    },
    styleUrls: ['./window-content.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [NgTemplateOutlet, SplitterComponent],
})
export class WindowContentComponent {
    transparent = input(false, { transform: booleanAttribute });

    sidebarVisible = input<boolean>(true);

    class = input<string>('');

    sidebarWidth = model(250);
    sidebarMaxWidth = input(550);
    sidebarMinWidth = input(100);

    toolbar = signal<WinSidebar | undefined>(undefined);

    sidebar = viewChild('sidebar', { read: ElementRef });
    sidebarContainer = viewChild('sidebarContainer', { read: ElementRef });
    content = viewChild('content', { read: ElementRef });

    withAnimation = signal(false);

    constructor(private windowState: WindowState) {
        effect(() => {
            const normalized = clamp(this.sidebarWidth(), this.sidebarMinWidth(), this.sidebarMaxWidth());
            this.sidebarWidth.set(normalized);
        });

        let last = this.sidebarVisible();
        effect(() => {
            if (this.sidebar() && this.sidebarContainer()) {
                if (last === this.sidebarVisible()) return;
                last = this.sidebarVisible();
                this.handleSidebarVisibility(true);
            }
        });
    }

    protected transitionEnded() {
        if (this.withAnimation()) {
            this.withAnimation.set(false);
            triggerResize();
        }
    }

    unregisterSidebar(sidebar: WinSidebar) {
        if (this.toolbar() === sidebar) this.toolbar.set(undefined);
    }

    registerSidebar(sidebar: WinSidebar) {
        this.toolbar.set(sidebar);
    }

    protected handleSidebarVisibility(withAnimation = false) {
        if (withAnimation && this.windowState.buttonGroupAlignedToSidebar()) {
            this.withAnimation.set(true);
            this.windowState.buttonGroupAlignedToSidebar()?.activateOneTimeAnimation();
        }
    }

    isSidebarVisible(): boolean {
        return undefined !== this.sidebar() && this.sidebarVisible();
    }
}
