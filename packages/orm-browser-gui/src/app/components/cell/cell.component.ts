import {
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    Input,
    OnChanges,
    OnDestroy,
    ViewContainerRef,
    inject,
} from '@angular/core';

import { Type } from '@deepkit/type';

import { ComponentRegistry } from '../../registry';
import { TypeDecoration } from './utils';

@Component({
    selector: 'orm-browser-property-view',
    template: ``,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: none;
            }
        `,
    ],
})
export class CellComponent implements OnDestroy, OnChanges {
    @Input() type!: Type;
    @Input() model!: any;
    @Input() decoration?: TypeDecoration;

    protected componentRef?: ComponentRef<any>;
    registry = inject(ComponentRegistry);

    constructor(private containerRef: ViewContainerRef) {}

    ngOnDestroy() {
        this.unlink();
    }

    unlink() {
        this.componentRef?.destroy();
    }

    ngOnChanges() {
        this.link();
    }

    link() {
        const component = this.registry.cellRegistry.get(this.type);
        if (!component) {
            return;
        }
        this.componentRef?.destroy();

        this.componentRef = this.containerRef.createComponent(component);
        this.componentRef.instance.type = this.type;
        this.componentRef.instance.decoration = this.decoration;
        this.componentRef.instance.model = this.model;
        this.componentRef.changeDetectorRef.detectChanges();
    }
}
