import {
    ChangeDetectionStrategy,
    Component,
    Renderer2,
    booleanAttribute,
    computed,
    effect,
    inject,
    input,
    model,
} from '@angular/core';

import { DragDirective, DuiDragEvent, DuiDragStartEvent } from '../app/drag';
import { clamp } from '../app/utils';

/**
 * A splitter component that can be used for layout resizing. With an indicator that shows a handle.
 *
 * This is typically used to resize layouts such as sidebars, panels, or other UI elements.
 *
 * Best used in combination with flex-basis CSS property to allow flexible resizing.
 *
 * ```html
 * <div class="layout">
 *   <div class="sidebar" [style.flex-basis.px]="sidebarSize()">
 *       <dui-splitter position="right" [size]="sidebarSize" (sizeChange)="sidebarSize.set($event)" indicator></dui-splitter>
 *   </div>
 *   <div class="content"></div>
 * </div>
 * ```
 */
@Component({
    selector: 'dui-splitter',
    template: '',
    styleUrls: ['./splitter.component.scss'],
    host: {
        '[class.splitter-right]': 'position() === "right"',
        '[class.splitter-left]': 'position() === "left"',
        '[class.splitter-top]': 'position() === "top"',
        '[class.splitter-bottom]': 'position() === "bottom"',
        '[class.splitter-with-indicator]': 'indicator()',
        '[class.horizontal]': 'isHorizontal()',
        '[class.vertical]': '!isHorizontal()',
        '(duiDragStart)': 'onDuiDragStart($event)',
        '(duiDrag)': 'onDuiDrag($event)',
        '(duiDragEnd)': 'onDuiDragEnd($event)',
        '(duiDragCancel)': 'onDuiDragCancel()',
    },
    changeDetection: ChangeDetectionStrategy.Eager,
    hostDirectives: [
        {
            directive: DragDirective,
            inputs: ['duiDragThreshold'],
            outputs: ['duiDragStart', 'duiDrag', 'duiDragEnd', 'duiDragCancel'],
        },
    ],
})
export class SplitterComponent {
    /**
     * When set, the splitter will show an indicator (handle) to indicate that it can be dragged.
     */
    indicator = input(false, { transform: booleanAttribute });

    size = model(0);

    inverted = input(false, { transform: booleanAttribute });

    /**
     * If set one of these, the splitter will be positioned absolutely in the layout.
     * Make sure to set a parent element with `position: relative;` to allow absolute positioning.
     */
    position = input<'left' | 'right' | 'top' | 'bottom'>();

    orientation = input<'horizontal' | 'vertical'>();

    /**
     * Per default splitter is vertical (movement left-to-right), meaning vertical line.
     * If set to true, it will be horizontal (movement top-to-bottom).
     */
    horizontal = input(false, { transform: booleanAttribute });

    min = input(0);
    max = input(Infinity);

    element = input<Element>();

    /**
     * When element is set, this CSS property will be used to set the size of the splitter.
     * Default is 'flex-basis', which is typically used in flexbox layouts.
     */
    property = input<'flex-basis' | 'width' | string>('flex-basis');

    isHorizontal = computed(
        () =>
            this.horizontal() ||
            this.position() === 'top' ||
            this.position() === 'bottom' ||
            this.orientation() === 'horizontal',
    );

    protected startSize = 0;
    protected renderer = inject(Renderer2);

    constructor() {
        effect(() => {
            const property = this.property();
            const element = this.element();
            if (!element) return;

            const size = this.size();
            if (size) {
                this.renderer.setStyle(element, property, `${size}px`);
            }
        });
    }

    protected onDuiDragStart($event: DuiDragStartEvent) {
        this.startSize = this.size();
        const element = this.element();
        if (!element) return;
        const rect = element.getBoundingClientRect();
        if (this.isHorizontal()) {
            this.startSize = rect.height;
        } else {
            this.startSize = rect.width;
        }
    }

    protected onDuiDragEnd(event: DuiDragEvent) {
        const element = this.element();
        if (!element) return;
        // it's important to reset this.size() to the final real size after the drag ends.
        // If for example dragged way too far, the size might be negative or too large.
        const rect = element.getBoundingClientRect();
        if (this.isHorizontal()) {
            this.size.set(rect.height);
            this.renderer.setStyle(element, this.property(), `${rect.height}px`);
        } else {
            this.size.set(rect.width);
            this.renderer.setStyle(element, this.property(), `${rect.width}px`);
        }
    }

    protected onDuiDrag(event: DuiDragEvent) {
        const delta = this.isHorizontal() ? event.deltaY : event.deltaX;
        const factor = this.inverted() ? -1 : 1;
        const value = clamp(this.startSize + delta * factor, this.min(), this.max());
        this.size.set(value);
        const element = this.element();
        if (element) {
            this.renderer.setStyle(element, this.property(), `${value}px`);
        }
    }

    protected onDuiDragCancel() {
        this.size.set(this.startSize);
    }
}
