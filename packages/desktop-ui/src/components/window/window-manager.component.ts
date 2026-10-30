import { ChangeDetectionStrategy, Component, Directive, ElementRef, TemplateRef } from '@angular/core';

import { WindowRegistry } from './window-state';

@Component({
    selector: 'dui-window-manager',
    template: ``,
    styles: [
        `
            :host {
                display: block;
                position: relative;
                flex: 1;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [WindowRegistry],
})
export class WindowManagerComponent {
    templates = new Map<string, TemplateRef<any>>();

    open(component: any, options: { [key: string]: any } = {}): void {}
}

/**
 * ```html
 * <dui-window-manager>
 *   <window-posts *duiWindowTemplate />
 * </dui-window-manager>
 * ```
 */
@Directive({
    selector: '[duiWindowTemplate]',
    standalone: true,
})
export class WindowTemplateDirective {
    constructor(
        private windowManager: WindowManagerComponent,
        public template: TemplateRef<any>,
        private element: ElementRef,
    ) {
        console.log('WindowTemplateDirective', template, element);
        // const tagName = element.nativeElement.tagName.toLowerCase();
        // console.log(tagName, template);
        //
        // windowManager.templates.set(tagName, template);
    }
}
