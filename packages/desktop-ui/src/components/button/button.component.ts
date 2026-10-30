/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { DOCUMENT } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    Directive,
    ElementRef,
    HostBinding,
    HostListener,
    Injectable,
    OnChanges,
    OnDestroy,
    OnInit,
    Optional,
    OutputEmitterRef,
    SkipSelf,
    WritableSignal,
    booleanAttribute,
    computed,
    effect,
    forwardRef,
    inject,
    input,
    model,
    output,
    signal,
} from '@angular/core';
import { RouterLinkActive } from '@angular/router';

import { ValueAccessorBase, ngValueAccessor } from '../../core/form';
import { isMacOs } from '../../core/utils';
import { RegisterEventListenerRemove, injectElementRef, registerEventListener } from '../app/utils';
import { FormComponent } from '../form/form.component';
import { IconComponent } from '../icon/icon.component';
import { AlignedButtonGroup, WindowState } from '../window/window-state';
import { WindowComponent } from '../window/window.component';

export abstract class ActiveComponent {
    abstract active: WritableSignal<boolean>;
    abstract registeredHotkey?: WritableSignal<string>;
    abstract showHotkey?: WritableSignal<boolean>;
    abstract destroy: OutputEmitterRef<void>;

    abstract activate(): void;
}

/**
 * hotkey has format of "ctrl+shift+alt+key", e.g "ctrl+s" or "shift+o"
 * and supports more than one, e.g. "ctrl+s,ctrl+o"
 */
export type HotKey = string;

function hotKeySize(hotkey: HotKey) {
    const hotkeys = hotkey.split(',');
    let size = hotkeys.length - 1;
    const isMac = isMacOs(); //mac uses one char per key, windows uses '⊞ WIN' for meta key, 'CTRL' for ctrl key, 'ALT' for alt key
    for (const hotkey of hotkeys) {
        const keys = hotkey.split('+');
        for (const key of keys) {
            if (key === 'ctrl') size += isMac ? 1 : 4;
            if (key === 'meta') size += isMac ? 1 : 4;
            if (key === 'shift') size += 1;
            if (key === 'alt') size += isMac ? 1 : 3;
            if (key !== 'ctrl' && key !== 'meta' && key !== 'alt' && key !== 'shift') size += key.length;
        }
    }

    return size;
}

function isHotKeyActive(hotkey: HotKey, event: KeyboardEvent) {
    const eventKey = event.key.toLowerCase();

    const hotkeys = hotkey.toLowerCase().split(',');
    for (const hotkey of hotkeys) {
        const keys = hotkey.split('+');
        let match = true;
        for (const key of keys) {
            if (key === 'ctrl' && !event.ctrlKey) {
                match = false;
                break;
            }
            if (key === 'meta' && !event.ctrlKey && !event.metaKey) {
                match = false;
                break;
            }
            if (key === 'shift' && !event.shiftKey) {
                match = false;
                break;
            }
            if (key === 'alt' && !event.altKey) {
                match = false;
                break;
            }
            if (key !== 'ctrl' && key !== 'meta' && key !== 'alt' && key !== 'shift' && key !== eventKey) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }

    return false;
}

@Component({
    selector: 'dui-button-hotkey',
    styles: [
        `
            :host {
                display: inline-flex;
                flex-direction: row;
                gap: 3px;
            }

            span {
                text-transform: uppercase;
                color: var(--dui-text-grey);
            }
        `,
    ],
    template: `
        @if (metaKey) {
            <span>{{ isMac ? '⌘' : 'WIN' }}</span>
        }
        @if (ctrlKey) {
            <span>{{ isMac ? '⌃' : 'CTRL' }}</span>
        }
        @if (altKey) {
            <span>{{ isMac ? '⌥' : 'ALT' }}</span>
        }
        @if (shiftKey) {
            <span>⇧</span>
        }
        @if (key) {
            <span>{{ key }}</span>
        }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [],
})
export class ButtonHotkeyComponent implements OnChanges, OnInit {
    hotkey = input<HotKey>('');

    protected isMac = isMacOs();

    protected metaKey = false;
    protected ctrlKey = false;
    protected shiftKey = false;
    protected altKey = false;
    protected key = '';

    ngOnInit() {
        this.parse();
    }

    ngOnChanges() {
        this.parse();
    }

    protected parse() {
        //reset all
        this.metaKey = false;
        this.ctrlKey = false;
        this.shiftKey = false;
        this.altKey = false;
        this.key = '';

        const hotkeyValue = this.hotkey();
        if (!hotkeyValue) return;

        const hotkeys = hotkeyValue.toLowerCase().trim().split(',');
        for (const hotkey of hotkeys) {
            const keys = hotkey.split('+');
            for (const key of keys) {
                if (key === 'ctrl') this.ctrlKey = true;
                if (key === 'meta') this.metaKey = true;
                if (key === 'shift') this.shiftKey = true;
                if (key === 'alt') this.altKey = true;
                if (key !== 'ctrl' && key !== 'shift' && key !== 'alt' && key !== 'meta') this.key = key;
            }
        }
    }
}

@Component({
    selector: 'dui-button',
    template: `
        @if (!iconRight() && icon(); as icon) {
            <dui-icon [color]="iconColor()" [name]="icon" [size]="iconSize()"></dui-icon>
        }
        <ng-content></ng-content>
        @if (iconRight() && icon(); as icon) {
            <dui-icon [color]="iconColor()" [name]="icon" [size]="iconSize()"></dui-icon>
        }
        @if (showHotkey() && registeredHotkey(); as hotkey) {
            <dui-button-hotkey [hotkey]="hotkey"></dui-button-hotkey>
        }
    `,
    host: {
        '[class.dui-normalized]': 'true',
        '[attr.tabindex]': '1',
        '[class.icon]': '!!icon()',
        '[class.small]': 'small()',
        '[class.tight]': 'tight()',
        '[class.highlighted]': 'highlighted()',
        '[class.primary]': 'primary()',
        '[class.icon-left]': 'icon() && !iconRight()',
        '[class.icon-right]': 'iconRight()',
        '[class.icon-only]': 'iconOnly()',
        '[class.square]': 'square()',
        '[class.textured]': 'textured()',
        '[class.active]': 'isActive()',
        '[class.disabled]': 'isDisabled()',
    },
    styleUrls: ['./button.component.scss'],
    hostDirectives: [{ directive: RouterLinkActive, inputs: ['routerLinkActiveOptions'] }],
    providers: [{ provide: ActiveComponent, useExisting: forwardRef(() => ButtonComponent) }],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [IconComponent, ButtonHotkeyComponent],
})
export class ButtonComponent implements OnInit, ActiveComponent, OnDestroy {
    hotKeySize = hotKeySize;
    destroy = output();

    /**
     * The icon for this button. Either a icon name same as for dui-icon, or an image path.
     */
    icon = input<string>();

    /**
     * Change in the icon size. Should not be necessary usually.
     */
    iconSize = input<number>();

    iconRight = input(false, { alias: 'icon-right', transform: booleanAttribute });

    iconColor = input<string>();

    showHotkey = model<boolean>(false);
    registeredHotkey = signal('');

    /**
     * Whether the button is active (pressed)
     */
    active = model<boolean>(false);

    /**
     * Whether the button has no padding and smaller font size
     */
    small = input(false, { transform: booleanAttribute });

    /**
     * Whether the button has smaller padding. Better for button with icons.
     */
    tight = input(false, { transform: booleanAttribute });

    /**
     * Whether the button is highlighted.
     */
    highlighted = input(false, { transform: booleanAttribute });

    /**
     * Whether the button is primary.
     */
    primary = input(false, { transform: booleanAttribute });

    /**
     * Whether the button is focused on initial loading.
     */
    autoFocus = input(false, { alias: 'auto-focus', transform: booleanAttribute });

    /**
     * The form to submit when this button is clicked.
     */
    submitForm = input<FormComponent>();

    disabled = input(false, { transform: booleanAttribute });
    square = input(false, { transform: booleanAttribute });
    textured = input(false, { transform: booleanAttribute });

    iconOnly = computed(() => {
        if (!this.icon()) return false;
        for (const child of this.element.nativeElement.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                return false;
            }
        }
        return true;
    });

    protected element = injectElementRef();
    protected formComponent = inject(FormComponent, { optional: true });
    protected routerLinkActive = inject(RouterLinkActive);

    isDisabled = computed(() => {
        if (this.formComponent && this.formComponent.disabled()) return true;
        const submitForm = this.submitForm();
        if (submitForm && (submitForm.invalid || submitForm.disabled() || submitForm.submitting())) {
            return true;
        }

        return this.disabled();
    });

    constructor() {
        this.element.nativeElement.removeAttribute('tabindex');
    }

    ngOnDestroy() {
        this.destroy.emit();
    }

    protected isActive() {
        return this.routerLinkActive.isActive || this.active();
    }

    activate() {
        this.element.nativeElement.click();
    }

    ngOnInit() {
        if (this.autoFocus()) {
            setTimeout(() => {
                this.element.nativeElement.focus();
            }, 10);
        }
    }

    @HostListener('click')
    protected async onClick() {
        if (this.isDisabled()) return;

        const submitForm = this.submitForm();
        if (submitForm) {
            void submitForm.submitForm();
        }
    }
}

@Injectable({ providedIn: 'root' })
export class HotkeyRegistry implements OnDestroy {
    active: { key: HotKey; component: ActiveComponent }[] = [];

    protected document = inject(DOCUMENT);
    protected removeKeyDown?: RegisterEventListenerRemove;
    protected removeKeyUp?: RegisterEventListenerRemove;
    protected knownComponents = new Set<ActiveComponent>();

    showHotKeyOn = 'alt';

    constructor() {
        this.removeKeyDown = registerEventListener(this.document, 'keydown', event => {
            // If only alt is pressed (not other keys, we display the hotkey)
            if (this.showHotKeyOn && event.key.toLowerCase() === this.showHotKeyOn) {
                for (const item of this.active) {
                    item.component.showHotkey?.set(true);
                }
                return;
            }

            for (const item of this.active) {
                if (isHotKeyActive(item.key, event)) {
                    this.activate(item.component);
                    event.preventDefault();
                    return;
                }
            }
        });

        this.removeKeyUp = registerEventListener(this.document, 'keydown', event => {
            // If only alt is pressed (not other keys, we display the hotkey)
            if (this.showHotKeyOn && event.key.toLowerCase() === this.showHotKeyOn) {
                for (const item of this.active) {
                    item.component.showHotkey?.set(false);
                }
                return;
            }
        });
    }

    activate(component: ActiveComponent) {
        if (component.active()) return;
        component.activate();
        component.active.set(true);

        setTimeout(() => {
            component.active.set(false);
        }, 200);
    }

    ngOnDestroy() {
        this.removeKeyDown?.();
        this.removeKeyUp?.();
    }

    unregister(component: ActiveComponent) {
        const index = this.active.findIndex(v => v.component === component);
        if (index !== -1) {
            this.active.splice(index, 1);
        }
        this.knownComponents.delete(component);
    }

    register(key: HotKey, component: ActiveComponent) {
        this.active = this.active.filter(v => v.component !== component);
        this.active.unshift({ key, component });
        if (!this.knownComponents.has(component)) {
            this.knownComponents.add(component);
            component.destroy.subscribe(() => {
                this.unregister(component);
            });
        }
    }
}

/**
 * Adds a hotkey to a button.
 *
 * ```html
 * <dui-button hotkey="escape">Cancel</dui-button>
 * <dui-button hotkey="cmd+s">Save</dui-button>
 * ```
 */
@Directive({ selector: '[hotkey]' })
export class HotkeyDirective implements OnDestroy {
    hotkey = input.required<HotKey>();
    protected oldButtonActive?: boolean;
    protected hotkeyRegistry = inject(HotkeyRegistry);
    protected activeComponent = inject(ActiveComponent, { optional: true });
    protected element = injectElementRef();

    registeredHotkey = signal('');

    active = signal(false);
    destroy = output();

    ngOnDestroy() {
        this.destroy.emit();
    }

    constructor() {
        const component = this.activeComponent || this;
        effect(() => {
            const hotkey = this.hotkey();
            component.registeredHotkey?.set(hotkey);
            if (hotkey) {
                this.hotkeyRegistry.register(hotkey, component);
            } else {
                this.hotkeyRegistry.unregister(component);
            }
        });
    }

    activate() {
        this.element.nativeElement.click();
    }
}

/**
 * Used to group buttons together.
 */
@Component({
    selector: 'dui-button-group',
    template: '<ng-content></ng-content>',
    host: {
        '[class.float-right]': `float() === 'right'`,
        '(transitionend)': 'transitionEnded()',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./button-group.component.scss'],
})
export class ButtonGroupComponent implements AfterViewInit, OnDestroy, AlignedButtonGroup {
    /**
     * How the button should behave.
     * `sidebar` means it aligns with the sidebar. Is the sidebar open, this button-group has a left margin.
     * Is it closed, the margin is gone.
     */
    float = input<'static' | 'sidebar' | 'float' | 'right'>('static');

    /**
     * If set to none, buttons inside this group will be tightly packed together without any padding.
     */
    padding = input<'normal' | 'none'>('normal');

    @HostBinding('class.padding-none')
    get isPaddingNone() {
        return this.padding() === 'none';
    }

    constructor(
        private element: ElementRef<HTMLElement>,
        @SkipSelf() protected cd: ChangeDetectorRef,
        @Optional() private windowState?: WindowState,
        @Optional() private windowComponent?: WindowComponent,
    ) {
        effect(() => this.updatePaddingLeft());
    }

    /**
     * @hidden
     */
    activateOneTimeAnimation() {
        (this.element.nativeElement as HTMLElement).classList.add('with-animation');
    }

    ngOnDestroy(): void {
        if (this.windowState && this.windowState.buttonGroupAlignedToSidebar() === this) {
            this.windowState.buttonGroupAlignedToSidebar.set(undefined);
        }
    }

    protected transitionEnded() {
        (this.element.nativeElement as HTMLElement).classList.remove('with-animation');
    }

    ngAfterViewInit(): void {
        if (this.float() === 'sidebar' && this.windowState) {
            this.windowState.buttonGroupAlignedToSidebar.set(this);
        }
    }

    protected updatePaddingLeft() {
        if (this.float() === 'sidebar' && this.windowComponent) {
            const content = this.windowComponent.content();
            if (content && content.isSidebarVisible()) {
                const newLeft = Math.max(0, content.sidebarWidth() - this.element.nativeElement.offsetLeft) + 'px';
                if (this.element.nativeElement.style.paddingLeft == newLeft) {
                    //no transition change, doesn't trigger transitionEnd
                    (this.element.nativeElement as HTMLElement).classList.remove('with-animation');
                    return;
                }
                this.element.nativeElement.style.paddingLeft = newLeft;
                return;
            }
            this.element.nativeElement.style.paddingLeft = '0px';
        }
    }
}

@Component({
    selector: 'dui-button-groups',
    template: ` <ng-content></ng-content> `,
    host: {
        '[class.align-left]': `align() === 'left'`,
        '[class.align-center]': `align() === 'center'`,
        '[class.align-right]': `align() === 'right'`,
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./button-groups.component.scss'],
})
export class ButtonGroupsComponent {
    align = input<'left' | 'center' | 'right'>('left');
}

/**
 * Directive to open the native file chooser dialog.
 * Can be used wth FormsModule (ngModel).
 *
 * ```html
 * <dui-button duiFileChooser duiFileChooserChange="open($event)">Open File</dui-button>
 * ```
 */
@Directive({
    selector: '[duiFileChooser]',
    providers: [ngValueAccessor(FileChooserDirective)],
})
export class FileChooserDirective extends ValueAccessorBase<File[]> implements OnDestroy, OnChanges {
    duiFileMultiple = input(false, { transform: booleanAttribute });
    duiFileDirectory = input(false, { transform: booleanAttribute });

    duiFileChooserChange = output<File[]>();

    protected input: HTMLInputElement;

    constructor() {
        super();
        const inputElement = document.createElement('input');
        inputElement.setAttribute('type', 'file');
        this.input = inputElement;
        this.input.addEventListener('change', (event: any) => {
            const files = event.target.files as FileList;
            if (files.length) {
                if (this.duiFileMultiple()) {
                    const result: File[] = [];
                    for (let i = 0; i < files.length; i++) {
                        const file = files.item(i);
                        if (!file) continue;
                        result.push(file);
                    }
                    this.setValue(result);
                } else {
                    this.setValue([files.item(0)!]);
                }
                this.duiFileChooserChange.emit(this.value() || []);
            }
        });
    }

    ngOnDestroy() {}

    ngOnChanges(): void {
        (this.input as any).webkitdirectory = this.duiFileDirectory();
        this.input.multiple = this.duiFileMultiple();
    }

    @HostListener('click')
    protected onClick() {
        this.input.click();
    }
}

export interface FilePickerItem {
    data: Uint8Array;
    name: string;
    mimeType: string;
}

function readFile(file: File): Promise<Uint8Array | undefined> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result) {
                if (reader.result instanceof ArrayBuffer) {
                    resolve(new Uint8Array(reader.result));
                } else {
                    resolve(undefined);
                }
            }
        };
        reader.onerror = error => {
            console.log('Error: ', error);
            reject();
        };

        reader.readAsArrayBuffer(file);
    });
}

/**
 * Directive to open the native file picker dialog and return the selected files as Uint8Array.
 * Can be used wth FormsModule (ngModel).
 *
 * ```html
 * <dui-button duiFilePicker duiFilePickerChange="open($event)">Open File</dui-button>
 * ```
 */
@Directive({
    selector: '[duiFilePicker]',
    providers: [ngValueAccessor(FileChooserDirective)],
})
export class FilePickerDirective extends ValueAccessorBase<FilePickerItem[]> implements OnDestroy, AfterViewInit {
    duiFileMultiple = input(false, { transform: booleanAttribute });
    duiFileAutoOpen = input<boolean>(false);

    duiFilePickerChange = output<FilePickerItem[]>();

    protected input: HTMLInputElement;

    constructor() {
        super();
        const inputElement = document.createElement('input');
        inputElement.setAttribute('type', 'file');
        this.input = inputElement;

        this.input.addEventListener('change', async (event: any) => {
            const files = event.target.files as FileList;
            if (files.length) {
                if (this.duiFileMultiple() !== false) {
                    const res: FilePickerItem[] = [];
                    for (let i = 0; i < files.length; i++) {
                        const file = files.item(i);
                        if (file) {
                            const uint8Array = await readFile(file);
                            if (uint8Array) {
                                res.push({ data: uint8Array, name: file.name, mimeType: file.type });
                            }
                        }
                    }
                    this.setValue(res);
                } else {
                    const file = files.item(0);
                    if (file) {
                        const data = await readFile(file);
                        if (data) {
                            this.setValue([{ data, name: file.name, mimeType: file.type }]);
                        }
                    }
                }
                this.duiFilePickerChange.emit(this.value() || []);
            }
        });
    }

    ngOnDestroy() {}

    ngAfterViewInit() {
        if (this.duiFileAutoOpen()) this.onClick();
    }

    @HostListener('click')
    protected onClick() {
        this.input.multiple = this.duiFileMultiple();
        this.input.click();
    }
}

/**
 * Directive to allow dropping files into an area.
 * Can be used wth FormsModule (ngModel).
 *
 * ```html
 * <div duiFileDrop (duiFileDropChange)="onFilesDropped($event)">
 *     Drop files here
 * </div>
 * ```
 */
@Directive({
    selector: '[duiFileDrop]',
    host: {
        '[class.file-drop-hover]': 'i() > 0',
    },
    providers: [ngValueAccessor(FileChooserDirective)],
})
export class FileDropDirective extends ValueAccessorBase<FilePickerItem[]> implements OnDestroy {
    duiFileDropMultiple = input(false, { transform: booleanAttribute });
    duiFileDropChange = output<FilePickerItem[]>();

    i = signal(0);

    @HostListener('dragenter', ['$event'])
    protected onDragEnter(ev: any) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();
        this.i.update(v => v + 1);
    }

    @HostListener('dragover', ['$event'])
    protected onDragOver(ev: any) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();
    }

    @HostListener('dragleave', ['$event'])
    protected onDragLeave(ev: any) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();
        this.i.update(v => v - 1);
    }

    @HostListener('drop', ['$event'])
    protected async onDrop(ev: any) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();

        const res: FilePickerItem[] = [];
        if (ev.dataTransfer.items) {
            // Use DataTransferItemList interface to access the file(s)
            for (let i = 0; i < ev.dataTransfer.items.length; i++) {
                // If dropped items aren't files, reject them
                if (ev.dataTransfer.items[i].kind === 'file') {
                    const file = ev.dataTransfer.items[i].getAsFile();
                    if (file) {
                        const uint8Array = await readFile(file);
                        if (uint8Array) {
                            res.push({ data: uint8Array, name: file.name, mimeType: file.type });
                        }
                    }
                }
            }
        } else {
            // Use DataTransfer interface to access the file(s)
            for (let i = 0; i < ev.dataTransfer.files.length; i++) {
                const file = ev.dataTransfer.files.item(i);
                if (file) {
                    const uint8Array = await readFile(file);
                    if (uint8Array) {
                        res.push({ data: uint8Array, name: file.name, mimeType: file.type });
                    }
                }
            }
        }
        if (this.duiFileDropMultiple()) {
            this.setValue(res);
        } else {
            if (res.length) {
                this.setValue([res[0]]);
            } else {
                this.setValue([]);
            }
        }
        this.duiFileDropChange.emit(this.value() || []);
        this.i.set(0);
    }

    ngOnDestroy() {}
}
