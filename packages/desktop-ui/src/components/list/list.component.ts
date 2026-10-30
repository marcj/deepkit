/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import {
    ChangeDetectionStrategy,
    Component,
    EventEmitter,
    HostBinding,
    HostListener,
    OnDestroy,
    Output,
    booleanAttribute,
    inject,
    input,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { arrayRemoveItem } from '@deepkit/core';

import { ValueAccessorBase, ngValueAccessor } from '../../core/form';
import { injectElementRef } from '../app/utils';

/**
 * Non-interactive title item for a list.
 *
 * ```html
 * <dui-list>
 *  <dui-list-title>Title</dui-list-title>
 *  <dui-list-item value="1">Item 1</dui-list-item>
 * </list>
 * ```
 */
@Component({
    selector: 'dui-list-title',
    template: ` <ng-content></ng-content>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./list-title.component.scss'],
})
export class ListTitleComponent {
    constructor() {}
}

@Component({
    selector: 'dui-list',
    template: ` <ng-content></ng-content> `,
    styleUrls: ['./list.component.scss'],
    host: {
        '[class.white]': 'white()',
        '[class.overlay-scrollbar-small]': 'true',
        '[class.focusable]': 'focusable()',
        '[class.delimiter-line]': 'delimiterLine()',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [ngValueAccessor(ListComponent)],
})
export class ListComponent extends ValueAccessorBase<any> {
    static ids: number = 0;
    id = ++ListComponent.ids;

    white = input(false, { transform: booleanAttribute });
    focusable = input<boolean>(true);
    delimiterLine = input(false, { transform: booleanAttribute });

    @HostBinding('tabindex') protected tabIndex: number = 1;

    protected items: ListItemComponent[] = [];

    protected itemMap = new Map<string, ListItemComponent>();

    protected element = injectElementRef();

    /**
     * @hidden
     */
    deregister(item: ListItemComponent) {
        arrayRemoveItem(this.items, item);
        this.itemMap.delete(item.id + '');
    }

    /**
     * @hidden
     */
    register(item: ListItemComponent) {
        this.items.push(item);
        this.itemMap.set(item.id + '', item);
    }

    protected getSortedList(): ListItemComponent[] {
        const list = Array.from(this.element.nativeElement.querySelectorAll(`dui-list-item[list-id="${this.id}"]`));
        return list.map(v => this.itemMap.get(v.getAttribute('list-item-id')!)!);
    }

    @HostListener('keydown', ['$event'])
    protected async onKeyDown(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const selectedItem = this.getSelectedItem();
            if (selectedItem) {
                const items = this.getSortedList();
                const position = items.indexOf(selectedItem);

                if (items[position + 1]) {
                    await items[position + 1].select();
                }
            }
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            const selectedItem = this.getSelectedItem();
            if (selectedItem) {
                const items = this.getSortedList();
                const position = items.indexOf(selectedItem);

                if (items[position - 1]) {
                    await items[position - 1].select();
                }
            }
        }
    }

    public getSelectedItem(): ListItemComponent | undefined {
        for (const item of this.items) {
            if (item.isSelected()) {
                return item;
            }
        }

        return;
    }
}

/**
 * Interactive item for a list.
 * Supports router links, selection and more.
 *
 * ```html
 * <dui-list>
 *  <dui-list-item value="1">Item 1</dui-list-item>
 * </list>
 * ```
 */
@Component({
    selector: 'dui-list-item',
    template: ` <ng-content></ng-content> `,
    host: {
        '[class.selected]': 'isSelected()',
        '[attr.list-id]': 'list.id',
        '[attr.list-item-id]': 'id',
    },
    styleUrls: ['./list-item.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    hostDirectives: [{ directive: RouterLinkActive, inputs: ['routerLinkActiveOptions'] }],
})
export class ListItemComponent implements OnDestroy {
    protected static ids: number = 0;
    id = ++ListItemComponent.ids;
    protected activeClass = 'selected';

    value = input<any>();
    active = input<boolean>();

    /**
     * When position is dynamic, it might be handy to define the position
     * explicitly to make arrow-up/arrow-down navigation possible.
     */
    position = input<number>(0);

    @Output() onSelect = new EventEmitter<any>();

    protected element = injectElementRef();
    protected list = inject(ListComponent);
    protected router = inject(Router, { optional: true });
    protected routerLink = inject(RouterLink, { optional: true });
    protected routerLinkActive = inject(RouterLinkActive);

    constructor() {
        this.element.nativeElement.removeAttribute('tabindex');
        this.list.register(this);
    }

    ngOnDestroy(): void {
        this.list.deregister(this);
    }

    public async select() {
        const routerLink = this.routerLink;
        if (routerLink && this.router) {
            routerLink.onClick(1, false, false, false, false);
        } else {
            this.list.setValue(this.value());
        }
        this.onSelect.emit(this.value());
    }

    public isSelected(): boolean {
        const active = this.active();
        if (active !== undefined) return active;

        const value = this.value();
        if (value !== undefined) {
            return this.list.value() === value;
        }

        return this.routerLinkActive.isActive;
    }

    @HostListener('mousedown')
    protected onClick() {
        this.list.setValue(this.value());
        this.onSelect.emit(this.value());
    }
}
