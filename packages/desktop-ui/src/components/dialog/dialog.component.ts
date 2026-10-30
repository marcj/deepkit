/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { NgTemplateOutlet } from '@angular/common';
import {
    AfterViewInit,
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    Directive,
    ElementRef,
    EventEmitter,
    HostListener,
    Injector,
    OnChanges,
    OnDestroy,
    Optional,
    Output,
    SimpleChanges,
    TemplateRef,
    Type,
    ViewChild,
    ViewContainerRef,
    booleanAttribute,
    inject,
    input,
    model,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { OverlayStack, OverlayStackItem } from '../app/app';
import { unsubscribe } from '../app/reactivate-change-detection';
import { ButtonComponent } from '../button/button.component';
import { RenderComponentDirective } from '../core/render-component.directive';
import { WindowContentComponent } from '../window/window-content.component';
import { WindowRegistry } from '../window/window-state';
import { WindowComponent } from '../window/window.component';

@Component({
    template: `
        <dui-window [dialog]="true" [normalize-style]="$safeNavigationMigration(windowComponent?.normalizeStyle())">
            <dui-window-content class="{{ class() }}" [class.dui-normalized]="normalizeStyle()">
                @if (component()) {
                    <ng-container
                        #renderComponentDirective
                        [renderComponent]="component()"
                        [renderComponentInputs]="componentInputs()"
                    >
                    </ng-container>
                }

                @if (content(); as content) {
                    <ng-container [ngTemplateOutlet]="content"></ng-container>
                }

                @if (container(); as container) {
                    <ng-container [ngTemplateOutlet]="container"></ng-container>
                } @else {
                    <ng-content></ng-content>
                }
            </dui-window-content>

            @if (actions(); as actions) {
                <div class="dialog-actions">
                    <ng-container [ngTemplateOutlet]="actions"></ng-container>
                </div>
            }
        </dui-window>
    `,
    host: {
        '[attr.tabindex]': '1',
    },
    styleUrls: ['./dialog-wrapper.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [WindowComponent, WindowContentComponent, RenderComponentDirective, NgTemplateOutlet],
})
export class DialogWrapperComponent {
    component = input<Type<any>>();
    componentInputs = input<{ [name: string]: any }>({});

    actions = model<TemplateRef<any> | undefined>(undefined);
    container = model<TemplateRef<any> | undefined>(undefined);
    content = model<TemplateRef<any> | undefined>(undefined);
    class = input<string>('');
    normalizeStyle = input(false, { alias: 'normalize-style', transform: booleanAttribute });

    @ViewChild(RenderComponentDirective, { static: false }) renderComponentDirective?: RenderComponentDirective;

    windowComponent = inject(WindowComponent, { optional: true });

    setActions(actions: TemplateRef<any> | undefined) {
        this.actions.set(actions);
    }

    setDialogContainer(container: TemplateRef<any> | undefined) {
        this.container.set(container);
    }
}

/**
 * A dialog component that can be used to display content in a modal dialog.
 *
 * ```html
 * <dui-dialog #dialog [maxWidth]="500">
 *     Hello World!
 *     <dui-button closeDialog>Abort</dui-button>
 *     <dui-button>OK</dui-button>
 * </dui-dialog>
 * <dui-button openDialog="dialog">Open Dialog</dui-button>
 * ```
 */
@Component({
    selector: 'dui-dialog',
    template: ` <ng-template #template>
        <ng-content></ng-content>
    </ng-template>`,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: none;
            }
        `,
    ],
})
export class DialogComponent implements AfterViewInit, OnDestroy, OnChanges {
    title = input<string>('');

    visible = model<boolean>(false);

    class = input<string>('');

    noPadding = input(false, { transform: booleanAttribute });

    minWidth = input<number | string>();
    minHeight = input<number | string>();

    width = input<number | string>();
    height = input<number | string>();

    maxWidth = input<number | string>();
    maxHeight = input<number | string>();

    center = input<boolean>(false);

    backDropCloses = input<boolean>(false);

    normalizeStyle = input(false, { alias: 'normalize-style', transform: booleanAttribute });

    component = input<Type<any>>();
    componentInputs = input<{
        [name: string]: any;
    }>({});

    @Output() closed = new EventEmitter<any>();
    @Output() open = new EventEmitter<any>();

    @ViewChild('template', { static: true }) template?: TemplateRef<any>;

    actions?: TemplateRef<any> | undefined;
    container?: TemplateRef<any> | undefined;

    overlayRef?: OverlayRef;
    wrapperComponentRef?: ComponentRef<DialogWrapperComponent>;

    protected lastOverlayStackItem?: OverlayStackItem;

    constructor(
        protected applicationRef: ApplicationRef,
        protected overlayStack: OverlayStack,
        protected viewContainerRef: ViewContainerRef,
        protected overlay: Overlay,
        protected injector: Injector,
        protected registry: WindowRegistry,
        @Optional() protected window?: WindowComponent,
    ) {}

    toPromise(): Promise<any> {
        return new Promise(resolve => {
            this.closed.subscribe((v: any) => {
                resolve(v);
            });
        });
    }

    setDialogContainer(container: TemplateRef<any> | undefined) {
        this.container = container;
        if (this.wrapperComponentRef) {
            this.wrapperComponentRef.instance.setDialogContainer(container);
        }
    }

    setActions(actions: TemplateRef<any> | undefined) {
        this.actions = actions;
        if (this.wrapperComponentRef) {
            this.wrapperComponentRef.instance.setActions(actions);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.visible()) {
            this.show();
        } else {
            this.close(undefined);
        }
    }

    show() {
        if (this.overlayRef) {
            return;
        }

        const window = this.window ? this.window.getClosestNonDialogWindow() : this.registry.getOuterActiveWindow();
        const offsetTop = (window && window.header()?.getBottomPosition()) || 0;

        // const document = this.registry.getCurrentViewContainerRef().element.nativeElement.ownerDocument;

        //this is necessary for multi-window environments, but doesn't work yet.
        // const overlayContainer = new OverlayContainer(document);
        //
        // const overlay = new Overlay(
        //     this.injector.get(ScrollStrategyOptions),
        //     overlayContainer,
        //     this.injector.get(ComponentFactoryResolver),
        //     new OverlayPositionBuilder(this.injector.get(ViewportRuler), document, this.injector.get(Platform), overlayContainer),
        //     this.injector.get(OverlayKeyboardDispatcher),
        //     this.injector,
        //     this.injector.get(NgZone),
        //     document,
        //     this.injector.get(Directionality),
        // );
        const overlay = this.overlay;

        let positionStrategy = overlay
            .position()
            .global()
            .centerHorizontally()
            .top(offsetTop + 'px');

        const center = this.center();
        if (center) {
            positionStrategy = overlay.position().global().centerHorizontally().centerVertically();
        }

        this.overlayRef = overlay.create({
            width: this.width() || undefined,
            height: this.height() || undefined,
            minWidth: this.minWidth() || undefined,
            minHeight: this.minHeight() || undefined,
            maxWidth: this.maxWidth() || '90%',
            maxHeight: this.maxHeight() || '90%',
            hasBackdrop: true,
            panelClass: [
                this.class(),
                center ? 'dialog-overlay' : 'dialog-overlay-with-animation',
                this.noPadding() ? 'dialog-overlay-no-padding' : '',
            ],
            scrollStrategy: overlay.scrollStrategies.reposition(),
            positionStrategy: positionStrategy,
        });

        if (this.backDropCloses()) {
            this.overlayRef.backdropClick().subscribe(() => {
                this.close(undefined);
            });
        }

        const injector = Injector.create({
            parent: this.injector,
            providers: [
                { provide: DialogComponent, useValue: this },
                { provide: WindowComponent, useValue: window },
            ],
        });

        this.open.emit();
        const portal = new ComponentPortal(DialogWrapperComponent, this.viewContainerRef, injector);

        this.wrapperComponentRef = this.overlayRef.attach(portal);
        this.wrapperComponentRef.setInput('component', this.component());
        this.wrapperComponentRef.setInput('componentInputs', this.componentInputs());
        this.wrapperComponentRef.setInput('content', this.template);
        this.wrapperComponentRef.setInput('class', this.class());
        this.wrapperComponentRef.setInput('normalize-style', this.normalizeStyle());

        if (this.lastOverlayStackItem) this.lastOverlayStackItem.release();
        this.lastOverlayStackItem = this.overlayStack.register(this.overlayRef.hostElement, this, () => this.close());

        if (this.actions) {
            this.wrapperComponentRef.instance.setActions(this.actions);
        }

        if (this.container) {
            this.wrapperComponentRef.instance.setDialogContainer(this.container);
        }

        this.overlayRef.updatePosition();

        this.visible.set(true);

        this.wrapperComponentRef.location.nativeElement.focus();
    }

    protected beforeUnload() {
        if (this.lastOverlayStackItem) this.lastOverlayStackItem.release();

        this.wrapperComponentRef?.destroy();

        if (this.overlayRef) {
            this.overlayRef.detach();
            this.overlayRef.dispose();
            this.overlayRef = undefined;
        }
    }

    ngAfterViewInit() {}

    close(v?: any) {
        const open = !!this.overlayRef;
        this.beforeUnload();
        this.visible.set(false);
        if (open) {
            this.closed.emit(v);
        }
    }

    ngOnDestroy(): void {
        this.beforeUnload();
    }
}

/**
 * Directive to lazy load a dialog container.
 *
 * ```html
 * <dui-dialog #dialog>
 *   <ng-container *dialogContainer>
 *     Lazy loaded dialog content.
 *   </ng-container>
 * </dui-dialog>
 */
@Directive({ selector: '[dialogContainer]' })
export class DialogDirective {
    constructor(
        protected dialog: DialogComponent,
        public template: TemplateRef<any>,
    ) {
        this.dialog.setDialogContainer(this.template);
    }
}

@Component({
    selector: 'dui-dialog-actions',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: '<ng-template #template><ng-content></ng-content></ng-template>',
})
export class DialogActionsComponent implements AfterViewInit, OnDestroy {
    @ViewChild('template', { static: true }) template!: TemplateRef<any>;

    constructor(protected dialog: DialogComponent) {}

    ngAfterViewInit(): void {
        this.dialog.setActions(this.template);
    }

    ngOnDestroy(): void {
        if (this.dialog.actions === this.template) {
            this.dialog.setActions(undefined);
        }
    }
}

@Component({
    selector: 'dui-dialog-error',
    template: '<ng-content></ng-content>',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./dialog-error.component.scss'],
})
export class DialogErrorComponent {}

/**
 * A directive to close the dialog on regular left click.
 * Can be used inside a dialog to close it.
 *
 * ```html
 * <dui-button closeDialog>Close</dui-button>
 * ```
 */
@Directive({ selector: '[closeDialog]' })
export class CloseDialogDirective {
    closeDialog = input<any>();

    constructor(protected dialog: DialogComponent) {}

    @HostListener('click')
    protected onClick() {
        this.dialog.close(this.closeDialog());
    }
}

/**
 * A directive to open the given dialog on regular left click.
 *
 * ```html
 * <dui-dialog #myDialog>
 *     Hi there!
 * </dui-dialog>
 * <dui-button openDialog="myDialog">Open Dialog</dui-button>
 * ```
 */
@Directive({ selector: '[openDialog]' })
export class OpenDialogDirective implements AfterViewInit, OnChanges, OnDestroy {
    openDialog = input<DialogComponent>();

    @unsubscribe()
    openSub?: Subscription;

    @unsubscribe()
    hiddenSub?: Subscription;

    constructor(
        protected elementRef: ElementRef,
        @Optional() protected button?: ButtonComponent,
    ) {}

    ngOnDestroy() {}

    ngOnChanges() {
        this.link();
    }

    ngAfterViewInit() {
        this.link();
    }

    protected link() {
        const openDialog = this.openDialog();
        if (this.button && openDialog) {
            this.openSub = openDialog.open.subscribe(() => {
                if (this.button) this.button.active.set(true);
            });
            this.hiddenSub = openDialog.closed.subscribe(() => {
                if (this.button) this.button.active.set(false);
            });
        }
    }

    @HostListener('click')
    protected onClick() {
        const openDialog = this.openDialog();
        if (openDialog) openDialog.show();
    }
}
