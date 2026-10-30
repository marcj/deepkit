import { JsonPipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    Input,
    ViewContainerRef,
    inject,
} from '@angular/core';

import { TypeArray } from '@deepkit/type';

import { ComponentRegistry } from '../../registry';

@Component({
    template: ` {{ model | json }}`,
    imports: [JsonPipe],
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host ::ng-deep ~ ng-component:not(:last-of-type)::after {
                content: ',';
            }
        `,
    ],
})
export class ArrayCellComponent {
    @Input() model: any;
    @Input() type!: TypeArray;

    protected componentRefs: ComponentRef<any>[] = [];
    registry = inject(ComponentRegistry);

    constructor(private containerRef: ViewContainerRef) {}

    // ngOnChanges() {
    //     this.setLabel();
    // }
    //
    // ngOnInit() {
    //     this.setLabel();
    // }
    //
    // setLabel(): void {
    //     const subType = this.type.type;
    //
    //     if (!isArray(this.model)) return;
    //
    //     for (const ref of this.componentRefs) {
    //         ref.destroy();
    //     }
    //
    //     const component = this.registry.cellRegistry.get(subType);
    //     if (!component) return;
    //
    //     for (const item of this.model) {
    //         const componentRef = this.containerRef.createComponent(component);
    //         componentRef.instance.property = subType;
    //         componentRef.instance.model = item;
    //         componentRef.instance.type = subType;
    //
    //         this.componentRefs.push(componentRef);
    //         componentRef.changeDetectorRef.markForCheck();
    //     }
    // }
}
