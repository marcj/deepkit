/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ConnectedPosition } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    Directive,
    EmbeddedViewRef,
    OnDestroy,
    Renderer2,
    TemplateRef,
    ViewContainerRef,
    booleanAttribute,
    contentChildren,
    effect,
    forwardRef,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';

import { Electron } from '../../core/utils';
import {
    AdaptiveContainerComponent,
    AdaptiveHiddenContainer,
} from '../adaptive-container/adaptive-container.component';
import { ActiveComponent, ButtonHotkeyComponent, HotkeyRegistry } from '../button/button.component';
import {
    DropdownComponent,
    DropdownContainerDirective,
    DropdownItemComponent,
    DropdownSplitterComponent,
    OpenDropdownDirective,
} from '../button/dropdown.component';
import { IconComponent } from '../icon/icon.component';
import { WindowMenuState } from '../window/window-menu';
import { OverlayStack } from './app';
import type { BuiltTemplateItem } from './menu-electron';
import { OnDomCreationDirective, injectElementRef } from './utils';

@Directive()
export abstract class MenuBase implements ActiveComponent, OnDestroy {
    destroy = output();
    label = input<string>();
    sublabel = input<string>();
    icon = input<string>();
    disabled = input<boolean>(false);
    accelerator = input<string>();
    role = input<string>();
    hotkey = input<string>('');

    visible = input<boolean>(true);

    onlyMacOs = input(false, { transform: booleanAttribute });
    noMacOs = input(false, { transform: booleanAttribute });

    id = input<string>();
    before = input<string>();
    after = input<string>();
    beforeGroupContaining = input<string>();
    afterGroupContaining = input<string>();
    template = viewChild('template', { read: TemplateRef<MenuBase> });

    registeredHotkey = signal('');
    click = output();

    checkboxStyle = false;

    public type = '';
    level = signal(0);

    children = contentChildren(MenuBase, { descendants: false });

    active = signal(false);

    ngOnDestroy() {
        this.destroy.emit();
    }

    buildTemplate(item: BuiltTemplateItem) {}

    activate() {
        this.click.emit();
    }

    constructor() {
        effect(() => {
            for (const child of this.children()) {
                child.level.set(this.level() + 1);
            }
        });
    }

    public validOs(): boolean {
        if (Electron.isAvailable()) {
            if (this.onlyMacOs() && Electron.getProcess().platform !== 'darwin') {
                return false;
            }

            if (this.noMacOs() && Electron.getProcess().platform === 'darwin') {
                return false;
            }
        }

        return true;
    }
}

@Component({
    selector: 'dui-menu-item',
    providers: [{ provide: MenuBase, useExisting: forwardRef(() => MenuItemComponent) }],
    template: `
        <ng-template #template>
            <ng-content />
        </ng-template>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: none;
        }
    `,
})
export class MenuItemComponent extends MenuBase {
    type = 'input';
}

@Component({
    selector: 'dui-menu-div',
    providers: [{ provide: MenuBase, useExisting: forwardRef(() => MenuDivComponent) }],
    template: `
        <ng-template #template>
            <ng-content />
        </ng-template>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: `
        :host {
            display: none;
        }
    `,
})
export class MenuDivComponent extends MenuBase {
    type = 'div';
}

@Directive({
    selector: 'dui-menu-checkbox',
    providers: [{ provide: MenuBase, useExisting: forwardRef(() => MenuCheckboxDirective) }],
})
export class MenuCheckboxDirective extends MenuBase {
    checked = input<boolean>(false);

    type = 'checkbox';

    buildTemplate(item: BuiltTemplateItem) {
        item.checked = this.checked();
    }
}

@Directive({
    selector: 'dui-menu-radio',
    providers: [{ provide: MenuBase, useExisting: forwardRef(() => MenuRadioComponent) }],
})
export class MenuRadioComponent extends MenuBase {
    checked = input<boolean>(false);

    type = 'radio';

    buildTemplate(item: BuiltTemplateItem) {
        item.checked = this.checked();
    }
}

@Directive({
    selector: 'dui-menu-separator',
    providers: [{ provide: MenuBase, useExisting: forwardRef(() => MenuSeparatorComponent) }],
})
export class MenuSeparatorComponent extends MenuBase {
    type = 'separator';
}

@Directive({
    selector: '[duiMenuRender]',
})
export class MenuRenderDirective implements OnDestroy {
    duiMenuRender = input.required<readonly MenuBase[]>();
    template = input.required<TemplateRef<{ $implicit: MenuBase }>>();

    rootAsButton = input(false, { transform: booleanAttribute });

    protected elementRef = injectElementRef();
    protected viewContainerRef = inject(ViewContainerRef);
    protected createdViews: EmbeddedViewRef<any>[] = [];
    protected renderer = inject(Renderer2);

    constructor() {
        effect(() => {
            const items = this.duiMenuRender();
            for (const comp of this.createdViews) {
                comp.destroy();
            }
            this.createdViews = [];

            const needsCheckboxStyle = items.some(
                item => (item.visible() && item instanceof MenuCheckboxDirective) || item instanceof MenuRadioComponent,
            );

            for (const item of items) {
                if (!item.visible()) continue;
                item.checkboxStyle = needsCheckboxStyle;

                const view = this.viewContainerRef.createEmbeddedView(this.template(), { $implicit: item });
                this.createdViews.push(view);
            }
        });
    }

    ngOnDestroy() {
        for (const comp of this.createdViews) {
            comp.destroy();
        }
        this.createdViews = [];
    }
}

export interface TemplateContext {
    $implicit: MenuBase;
}

@Directive({
    selector: '[menuItemTemplate]',
})
export class MenuItemTemplate {
    static ngTemplateContextGuard(directive: unknown, context: unknown): context is TemplateContext {
        return true;
    }
}

@Component({
    selector: 'dui-menu',
    host: {
        ngSkipHydration: 'true',
    },
    template: `
        <ng-template #template2 menuItemTemplate let-item>
            @if (item.type === 'separator') {
                <dui-dropdown-separator />
            } @else if (item.type === 'radio') {
            } @else if (item.type === 'spacer') {
                @if (item.template(); as itemTemplate) {
                    <div *ngTemplateOutlet="itemTemplate; context: { $implicit: item }"></div>
                }
            } @else {
                @if (item.children().length) {
                    <dui-dropdown
                        #dropdown
                        (shown)="dropdownShown(dropdown, item.level())"
                        (hidden)="dropdownHidden(dropdown, item.level())"
                        (lostFocus)="lostFocus($event)"
                        [connectedPositions]="item.level() === 0 ? dropdownPositionsRoot : dropdownPositions"
                    >
                        <ng-container *dropdownContainer [duiMenuRender]="item.children()" [template]="template2" />
                    </dui-dropdown>
                    <dui-dropdown-item
                        [class.first-level]="item.level() === 0"
                        [active]="item.active()"
                        [checkbox]="item.checkboxStyle"
                        [disabled]="item.disabled()"
                        (onDomCreation)="registerDropdownItem($event, item)"
                        [openDropdown]="dropdown"
                        [openDropdownHover]="active()"
                    >
                        @if (!item.label() && item.template(); as itemTemplate) {
                            <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: item }"></ng-container>
                        } @else {
                            <span class="label">{{ item.label() }}</span>
                        }
                        @if (item.hotkey(); as hotkey) {
                            <dui-button-hotkey [hotkey]="hotkey"></dui-button-hotkey>
                        }
                        @if (item.level() > 0) {
                            <span class="space"></span>
                            <dui-icon class="more" name="arrow_right" />
                        }
                    </dui-dropdown-item>
                } @else {
                    <dui-dropdown-item
                        [class.first-level]="item.level() === 1"
                        (click)="activate(item)"
                        [active]="item.active()"
                        [checkbox]="item.checkboxStyle"
                        [selected]="selected(item)"
                        [disabled]="item.disabled()"
                        (onDomCreation)="registerDropdownItem($event, item)"
                        (pointerenter)="hideSiblingsAndAbove(item)"
                    >
                        @if (!item.label() && item.template(); as itemTemplate) {
                            <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: item }"></ng-container>
                        } @else {
                            <span class="label">{{ item.label() }}</span>
                        }
                        @if (item.hotkey(); as hotkey) {
                            <span class="space"></span>
                            <dui-button-hotkey [hotkey]="hotkey"></dui-button-hotkey>
                        }
                    </dui-dropdown-item>
                }
            }
        </ng-template>

        <dui-adaptive-container #adaptiveContainer>
            <ng-container [duiMenuRender]="children()" [template]="template2"></ng-container>
            <dui-dropdown-item
                class="first-level dui-adaptive-fallback"
                [openDropdown]="adaptiveContainer.dropdown()"
                [openDropdownHover]="active()"
            >
                {{ moreLabel() }}
            </dui-dropdown-item>
            <dui-dropdown
                #moreDropdown
                (shown)="dropdownShown(moreDropdown, 0)"
                (hidden)="dropdownHidden(moreDropdown, 0)"
                (lostFocus)="lostFocus($event)"
            >
                <div class="dui-dropdown-content" *dropdownContainer duiAdaptiveHiddenContainer></div>
            </dui-dropdown>
        </dui-adaptive-container>
    `,
    styles: `
        dui-button-hotkey {
            justify-self: flex-end;
            margin-left: auto;
        }

        .space {
            width: 8px;
        }

        dui-icon.more {
            justify-self: flex-end;
            margin-left: auto;
            margin-right: -4px;
        }

        dui-dropdown-item {
            flex: 0 0 auto;
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        forwardRef(() => AdaptiveContainerComponent),
        forwardRef(() => AdaptiveHiddenContainer),
        forwardRef(() => DropdownItemComponent),
        MenuRenderDirective,
        MenuItemTemplate,
        DropdownComponent,
        DropdownContainerDirective,
        OpenDropdownDirective,
        DropdownSplitterComponent,
        NgTemplateOutlet,
        ButtonHotkeyComponent,
        IconComponent,
        OnDomCreationDirective,
    ],
})
export class MenuComponent implements OnDestroy {
    /**
     * If true, this menu is used for the application menu bar (only works in Electron).
     */
    forApp = input(false, { transform: booleanAttribute });

    moreLabel = input('More');

    children = contentChildren(MenuBase, { descendants: false });
    adaptiveContainer = viewChild.required(AdaptiveContainerComponent);

    dropdownPositionsRoot: ConnectedPosition[] = [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    ];

    dropdownPositions: ConnectedPosition[] = [
        { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top' },
        { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top' },
    ];

    protected overlayStack = inject(OverlayStack);
    protected windowMenuState = inject(WindowMenuState, { optional: true });
    protected dropdowns = new Map<number, DropdownComponent>();
    protected hotkeyRegistry = inject(HotkeyRegistry);
    protected active = signal(false);

    protected dropdownItemsMap = new WeakMap<Element, MenuBase>();

    registerDropdownItem(item: Element, menu: MenuBase) {
        this.dropdownItemsMap.set(item, menu);
    }

    selected(item: MenuBase): boolean {
        if (item instanceof MenuCheckboxDirective) return item.checked();
        if (item instanceof MenuRadioComponent) return item.checked();
        return false;
    }

    constructor() {
        this.windowMenuState?.addMenu(this);
        effect(() => {
            registerHotkey(this.hotkeyRegistry, this.children());
        });

        function increaseLevelBy(item: MenuBase, increase: number) {
            item.level.set(item.level() + increase);
            for (const child of item.children()) {
                increaseLevelBy(child, increase);
            }
        }

        effect(() => {
            const hidden = this.adaptiveContainer().hiddenElements();
            for (const item of this.children()) {
                item.level.set(0);
            }
            for (const element of hidden) {
                const item = this.dropdownItemsMap.get(element);
                if (!item) continue;
                item.level.set(1);
            }
        });
    }

    activate(item: MenuBase) {
        item.activate();
        this.close();
    }

    close() {
        // Close all
        for (const dropdown of this.dropdowns.values()) {
            dropdown.close();
        }
        this.dropdowns.clear();
        this.active.set(false);
    }

    lostFocus(event: FocusEvent) {
        event.view?.addEventListener('click', e => (e.preventDefault(), e.stopImmediatePropagation()), {
            once: true,
            capture: true,
        });
        this.close();
    }

    protected hideSiblingsAndAbove(item: MenuBase) {
        const level = item.level();
        for (const [otherLevel, otherDropdown] of this.dropdowns.entries()) {
            if (otherLevel >= level) {
                otherDropdown.close();
                this.dropdowns.delete(otherLevel);
            }
        }
        this.active.set(this.dropdowns.size > 0);
    }

    dropdownHidden(dropdown: DropdownComponent, level: number) {
        const otherDropdown = this.dropdowns.get(level);
        if (otherDropdown === dropdown) {
            this.dropdowns.delete(level);
        }
        this.active.set(this.dropdowns.size > 0);
    }

    dropdownShown(dropdown: DropdownComponent, level: number) {
        // Close all other dropdowns with greater or same level
        for (const [otherLevel, otherDropdown] of this.dropdowns.entries()) {
            if (otherLevel >= level && otherDropdown !== dropdown) {
                otherDropdown.close();
                this.dropdowns.delete(otherLevel);
            }
        }
        this.dropdowns.set(level, dropdown);
        this.active.set(this.dropdowns.size > 0);
    }

    ngOnDestroy() {
        this.windowMenuState?.removeMenu(this);
    }
}

function registerHotkey(registry: HotkeyRegistry, items: readonly MenuBase[]): void {
    for (const item of items) {
        if (item.hotkey()) {
            registry.register(item.hotkey(), item);
        }
        registerHotkey(registry, item.children());
    }
}
