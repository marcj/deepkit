import {
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Optional,
    Output,
    SimpleChanges,
    ViewContainerRef,
    inject,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { TableComponent, unsubscribe } from '@deepkit/desktop-ui';
import { Type } from '@deepkit/type';

import { ComponentRegistry } from '../../registry';
import { isProperty } from '../../utils';

@Component({
    selector: 'orm-browser-property-editing',
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
export class InputEditingComponent implements OnDestroy, OnChanges {
    @Input() model: any;
    @Output() modelChange = new EventEmitter();

    @Input() row?: { [name: string]: any };
    @Input() type!: Type;

    @Input() autoOpen: boolean = true;

    @Output() done = new EventEmitter<any>();

    protected componentRef?: ComponentRef<any>;
    @unsubscribe()
    protected subDone?: Subscription;
    @unsubscribe()
    protected subKey?: Subscription;
    @unsubscribe()
    protected subChange?: Subscription;

    registry = inject(ComponentRegistry);

    constructor(
        private containerRef: ViewContainerRef,
        @Optional() private table?: TableComponent<any>,
    ) {}

    ngOnDestroy() {
        this.unlink();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes.property || changes.type) this.link();
    }

    protected unlink() {
        this.subDone?.unsubscribe();
        this.subKey?.unsubscribe();
        this.componentRef?.destroy();
    }

    protected link() {
        this.unlink();

        const component = this.registry.inputRegistry.get(this.type);
        if (!component) {
            return;
        }

        this.componentRef = this.containerRef.createComponent(component);
        this.componentRef.instance.model = this.model;
        this.componentRef.instance.modelChange = this.modelChange;
        this.componentRef.instance.type = this.type;
        this.componentRef.instance.row = this.row;
        this.componentRef.instance.autoOpen = this.autoOpen;

        const property = this.type.parent && isProperty(this.type.parent) ? this.type.parent : undefined;

        this.subDone = this.componentRef.instance.done.subscribe(() => {
            if (this.row && property && this.row.$__activeColumn === property.name)
                this.row.$__activeColumn = undefined;
            this.done.emit(this.row);
        });

        if (this.table) {
            this.subKey = this.componentRef.instance.keyDown.subscribe((event: KeyboardEvent) => {
                if (!this.table || !this.row) return;

                if (event.key.toLowerCase() !== 'tab') return;
                event.preventDefault();
                console.log('input keydown', event);
                const currentColumn = this.row.$__activeColumn;
                const currentIndex = this.table.sortedColumns().findIndex(v => v.name() === currentColumn);
                if (currentIndex === -1) return;

                if (event.shiftKey) {
                    const next = this.table.sortedColumns()[currentIndex - 1];
                    if (next) this.row.$__activeColumn = next.name();
                } else {
                    const next = this.table.sortedColumns()[currentIndex + 1];
                    if (next) this.row.$__activeColumn = next.name();
                }
            });
        }
    }
}
