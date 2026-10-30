/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ComponentPortal, DomPortalOutlet } from '@angular/cdk/portal';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
    AfterViewInit,
    ApplicationRef,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ComponentRef,
    Directive,
    Injector,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    TemplateRef,
    Type,
    ViewChild,
    ViewContainerRef,
    input,
    model,
    output,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { nextTick } from '@deepkit/core';

import { BrowserWindow, Electron } from '../../core/utils';
import { RenderComponentDirective } from '../core/render-component.directive';
import { DuiDialog } from '../dialog/dialog';
import { WindowRegistry } from '../window/window-state';
import { WindowComponent } from '../window/window.component';

function PopupCenter(url: string, title: string, w: number, h: number): Window {
    let top = window.screenTop + window.outerHeight / 2 - w / 2;
    top = top > 0 ? top : 0;

    let left = window.screenLeft + window.outerWidth / 2 - w / 2;
    left = left > 0 ? left : 0;

    return window.open(url, title, 'width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)!;
}

@Component({
    template: `
        @if (component()) {
            <ng-container
                #renderComponentDirective
                [renderComponent]="component()"
                [renderComponentInputs]="componentInputs()"
            >
            </ng-container>
        }

        @if (content) {
            <ng-container [ngTemplateOutlet]="content"></ng-container>
        }

        @if (container) {
            <ng-container [ngTemplateOutlet]="container"></ng-container>
        }

        @if (!container) {
            <ng-content></ng-content>
        }
    `,
    host: {
        '[attr.tabindex]': '1',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [RenderComponentDirective, NgTemplateOutlet],
})
export class ExternalDialogWrapperComponent {
    component = input<Type<any>>();
    componentInputs = input<{
        [name: string]: any;
    }>({});

    actions?: TemplateRef<any> | undefined;
    container?: TemplateRef<any> | undefined;
    content?: TemplateRef<any> | undefined;

    @ViewChild(RenderComponentDirective, { static: false }) renderComponentDirective?: RenderComponentDirective;

    constructor(
        protected cd: ChangeDetectorRef,
        public injector: Injector,
    ) {}

    public setDialogContainer(container: TemplateRef<any> | undefined) {
        this.container = container;
        this.cd.detectChanges();
    }
}

@Component({
    selector: 'dui-external-dialog',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <ng-template #template>
            <ng-content></ng-content>
        </ng-template>
    `,
})
export class ExternalWindowComponent implements AfterViewInit, OnDestroy, OnChanges {
    private portalHost?: DomPortalOutlet;

    alwaysRaised = input(false);

    visible = model(true);

    closed = output();

    component = input<Type<any>>();
    componentInputs = input<{
        [name: string]: any;
    }>({});

    public wrapperComponentRef?: ComponentRef<ExternalDialogWrapperComponent>;

    @ViewChild('template', { static: false }) template?: TemplateRef<any>;

    externalWindow?: Window;
    container?: TemplateRef<any> | undefined;

    observerStyles?: MutationObserver;
    observerClass?: MutationObserver;

    parentFocusSub?: Subscription;
    electronWindow?: any;
    parentWindow?: WindowComponent;

    constructor(
        protected applicationRef: ApplicationRef,
        protected injector: Injector,
        protected dialog: DuiDialog,
        protected registry: WindowRegistry,
        protected cd: ChangeDetectorRef,
        protected viewContainerRef: ViewContainerRef,
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (this.visible()) {
            this.show();
        } else {
            this.close();
        }
    }

    public setDialogContainer(container: TemplateRef<any> | undefined) {
        this.container = container;
        if (this.wrapperComponentRef) {
            this.wrapperComponentRef.instance.setDialogContainer(container);
        }
    }

    public show() {
        if (this.externalWindow) {
            this.electronWindow.focus();
            return;
        }

        this.externalWindow = PopupCenter('', '', 300, 300);

        if (!this.externalWindow) {
            this.dialog.alert('Error', 'Could not open window.');
            return;
        }

        this.externalWindow.onunload = () => {
            this.close();
        };

        const cloned = new Map<Node, Node>();

        for (let i = 0; i < window.document.styleSheets.length; i++) {
            const style = window.document.styleSheets[i];
            if (!style.ownerNode) continue;
            const clone: Node = style.ownerNode.cloneNode(true);
            cloned.set(style.ownerNode, clone);
            this.externalWindow.document.head.appendChild(clone);
        }

        const externalWindow = this.externalWindow;

        this.observerStyles = new MutationObserver((mutations: MutationRecord[]) => {
            for (const mutation of mutations) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (!cloned.has(node)) {
                        const clone: Node = node.cloneNode(true);
                        cloned.set(node, clone);
                        externalWindow.document.head.appendChild(clone);
                    }
                }

                for (let i = 0; i < mutation.removedNodes.length; i++) {
                    const node = mutation.removedNodes[i];
                    if (cloned.has(node)) {
                        const clone = cloned.get(node)!;
                        clone.parentNode?.removeChild(clone);
                        cloned.delete(node);
                    }
                }
            }
        });

        this.observerStyles.observe(window.document.head!, {
            childList: true,
        });

        const copyBodyClass = () => {
            if (this.externalWindow) {
                this.externalWindow.document.body.className = window.document.body.className;
            }
        };

        this.observerClass = new MutationObserver((mutations: MutationRecord[]) => {
            copyBodyClass();
        });

        this.observerClass.observe(window.document.body, {
            attributeFilter: ['class'],
        });
        const document = this.externalWindow.document;

        copyBodyClass();

        this.electronWindow = Electron.isAvailable()
            ? Electron.getRemote().BrowserWindow.getAllWindows()[0]
            : undefined;
        this.parentWindow = this.registry.getOuterActiveWindow() as WindowComponent;

        if (this.parentWindow && this.alwaysRaised()) {
            this.parentWindow.windowState.disableInputs.set(true);
            if (this.parentWindow.browserWindow) {
                this.electronWindow.setParentWindow(this.parentWindow.browserWindow);
            }
        }

        window.addEventListener('beforeunload', () => {
            this.beforeUnload();
        });

        this.portalHost = new DomPortalOutlet(document.body);

        //todo, add beforeclose event and call beforeUnload() to make sure all dialogs are closed when page is reloaded

        const injector = Injector.create({
            parent: this.injector,
            providers: [
                { provide: ExternalWindowComponent, useValue: this },
                { provide: BrowserWindow, useValue: new BrowserWindow(this.electronWindow) },
                { provide: DOCUMENT, useValue: this.externalWindow.document },
            ],
        });

        const portal = new ComponentPortal(ExternalDialogWrapperComponent, this.viewContainerRef, injector);

        this.wrapperComponentRef = this.portalHost.attach(portal);
        this.wrapperComponentRef.setInput('component', this.component());
        this.wrapperComponentRef.setInput('componentInputs', this.componentInputs());
        this.wrapperComponentRef.setInput('content', this.template);

        if (this.container) {
            this.wrapperComponentRef.instance.setDialogContainer(this.container);
        }

        this.visible.set(true);

        this.wrapperComponentRef.changeDetectorRef.detectChanges();
        this.wrapperComponentRef.location.nativeElement.focus();

        this.cd.detectChanges();
    }

    beforeUnload() {
        if (this.externalWindow) {
            if (this.portalHost) {
                this.portalHost.detach();
                this.portalHost.dispose();
                delete this.portalHost;
            }
            this.closed.emit();
            if (this.parentFocusSub) this.parentFocusSub.unsubscribe();

            if (this.parentWindow && this.alwaysRaised()) {
                this.parentWindow.windowState.disableInputs.set(false);
            }
            if (this.externalWindow) {
                this.externalWindow.close();
            }

            delete this.externalWindow;
            this.observerStyles?.disconnect();
            this.observerClass?.disconnect();
        }
    }

    ngAfterViewInit() {}

    public close() {
        this.visible.set(false);
        this.beforeUnload();
        nextTick(() => {
            this.applicationRef.tick();
        });
    }

    ngOnDestroy(): void {
        this.beforeUnload();
    }
}

/**
 * This directive is necessary if you want to load and render the dialog content
 * only when opening the dialog. Without it it is immediately render, which can cause
 * performance and injection issues.
 */
@Directive({ selector: '[externalDialogContainer]' })
export class ExternalDialogDirective {
    constructor(
        protected dialog: ExternalWindowComponent,
        public template: TemplateRef<any>,
    ) {
        this.dialog.setDialogContainer(this.template);
    }
}
