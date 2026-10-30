import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    Directive,
    ElementRef,
    OnDestroy,
    OnInit,
    computed,
    contentChild,
    effect,
    forwardRef,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';

import { injectElementRef } from '../app/utils';
import { DropdownComponent, DropdownContainerDirective } from '../button/dropdown.component';

type DuiAdaptivePlaceholder = Comment & { duiElement: DuiAdaptiveElement };
type DuiAdaptiveElement = HTMLElement & { duiPlaceholder?: DuiAdaptivePlaceholder };

function isAdaptivePlaceholder(node: Node): node is DuiAdaptivePlaceholder {
    return node instanceof Comment && 'duiElement' in node;
}

/**
 * The AdaptiveContainerComponent is a flexible container that arranges its child elements
 * in a row or column, depending on the specified direction. It uses flexbox to manage the layout
 * and automatically hides elements that overflow the container's bounds.
 *
 * The container uses flex-wrap: nowrap to detect overflow and hides elements (display: none) that do not fit.
 *
 * Overflowing elements can be moved to a hidden container automatically, which per default is put into a dropdown
 * that can be opened to show the hidden elements.
 *
 * ```html
 * <dui-adaptive-container>
 *     <dui-button>Button 1</dui-button>
 *     <dui-button>Button 2</dui-button>
 *     <dui-button>Button 3</dui-button>
 *     <dui-button>Button 4</dui-button>
 * </dui-adaptive-container>
 * ```
 */
@Component({
    selector: 'dui-adaptive-container',
    host: {
        ngSkipHydration: 'true',
        '[class.row]': 'direction() === "row"',
        '[class.column]': 'direction() === "column"',
        '[class.row-reverse]': 'direction() === "row-reverse"',
        '[class.column-reverse]': 'direction() === "column-reverse"',
    },
    template: `
        <ng-content></ng-content>
        @if (!contentDropdownComponent()) {
            <dui-dropdown class="dropdownClass()" [host]="host">
                <div
                    class="dui-adaptive-container-dropdown-content"
                    *dropdownContainer
                    duiAdaptiveHiddenContainer
                ></div>
            </dui-dropdown>
        }
    `,
    styleUrl: './adaptive-container.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DropdownComponent, forwardRef(() => AdaptiveHiddenContainer), DropdownContainerDirective],
})
export class AdaptiveContainerComponent implements OnInit, AfterViewInit, OnDestroy {
    protected host = injectElementRef();
    protected contentDropdownComponent = contentChild(DropdownComponent);
    protected viewDropdownComponent = viewChild(DropdownComponent);

    dropdown = computed(() => this.viewDropdownComponent() || this.contentDropdownComponent());

    /**
     * Per default, the dui-adaptive-container will be made adaptive. Pass an Element or ElementRef to
     * use a different element as the container.
     */
    element = input<Element | ElementRef>();

    /**
     * The class to apply to the dropdown container.
     */
    dropdownClass = input('');

    direction = input<'row' | 'column' | 'row-reverse' | 'column-reverse'>('row');

    /**
     * Triggers for elements that are now hidden.
     */
    visibilityChange = output<Element[]>();

    /**
     * Trigger for elements that were hidden and are now shown again.
     */
    showElements = output<Element[]>();

    protected effectiveElement = computed<HTMLElement>(() => {
        const element = this.element();
        return element instanceof ElementRef ? element.nativeElement : element || this.host.nativeElement;
    });

    protected vertical = computed(() => this.direction() === 'column' || this.direction() === 'column-reverse');

    hiddenElements = signal<HTMLElement[]>([]);
    /**
     * The elements that are currently hidden, either currently hidden (display: none) or moved to the hidden container.
     */

    hiddenContainer = signal<HTMLElement | undefined>(undefined);

    registerHiddenContainer(hiddenContainer: HTMLElement) {
        this.hiddenContainer.set(hiddenContainer);
        const state = getState(this.effectiveElement());
        // Move all hidden items to the hidden container
        for (const node of state.nodes) {
            if (!isHidden(node, hiddenContainer)) continue;
            hideElement(node, hiddenContainer);
        }
    }

    unregisterHiddenContainer(hiddenContainer: HTMLElement) {
        if (this.hiddenContainer() === hiddenContainer) {
            this.hiddenContainer.set(undefined);
            // Move all items back
            const visibleContainer = this.effectiveElement();
            for (let i = hiddenContainer.childNodes.length - 1; i >= 0; i--) {
                const element = hiddenContainer.childNodes[i];
                if (element instanceof HTMLElement && 'duiPlaceholder' in element) {
                    element.style.display = 'none';
                    visibleContainer.insertBefore(element, element.duiPlaceholder as DuiAdaptivePlaceholder);
                }
            }
        }
    }

    update() {
        const visibleContainer = this.effectiveElement();
        const hiddenContainer = this.hiddenContainer();

        const vertical = this.vertical();
        const { nodes, fallbacks } = getState(visibleContainer);

        if (isOverflowing(visibleContainer, vertical)) {
            for (const node of fallbacks) node.style.display = '';

            const nowHidden: HTMLElement[] = [];
            // Hide one more from the end until no overflow anymore.
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                const element = node instanceof Comment ? node.duiElement : node;
                if (isHidden(node, hiddenContainer)) {
                    nowHidden.unshift(element);
                    continue;
                }
                hideElement(node, hiddenContainer);
                nowHidden.unshift(element);

                if (!isOverflowing(visibleContainer, vertical)) {
                    // It fits now, so we are done
                    break;
                }
            }
            this.hiddenElements.set(nowHidden);
        } else {
            for (const node of fallbacks) node.style.display = 'none';

            const hiddenNodes = nodes.filter(node => isHidden(node, hiddenContainer));
            // All visible, so nothing we can do
            if (!hiddenNodes.length) return;
            // Check if there is room for more elements

            // 1. Check if all fit without fallbacks
            for (const node of hiddenNodes) {
                showElement(node, visibleContainer);
            }

            if (!isOverflowing(visibleContainer, vertical)) {
                // Great all fit, keep it like this
                this.hiddenElements.set([]);
                return;
            }

            // Since we have overflow, make sure fallbacks are visible again
            // and elements are hidden again
            for (const node of fallbacks) node.style.display = '';
            for (let i = hiddenNodes.length - 1; i >= 0; i--) {
                hideElement(hiddenNodes[i], hiddenContainer);
            }

            // 2. Try to unhide one more until it overflows again
            let unhidden = 0;
            for (const node of hiddenNodes) {
                // Show it
                showElement(node, visibleContainer);

                if (isOverflowing(visibleContainer, vertical)) {
                    // It does not fit, so hide it again and stop
                    hideElement(node, hiddenContainer);
                    break;
                }
                unhidden++;
            }
            const nowHidden = hiddenNodes.slice(unhidden).map(v => (v instanceof Comment ? v.duiElement : v));
            this.hiddenElements.set(nowHidden);
        }
    }

    protected lastObserver: ResizeObserver | undefined;
    protected lastMutationObserver: MutationObserver | undefined;

    constructor() {
        if ('undefined' !== typeof ResizeObserver) {
            effect(() => {
                this.lastObserver?.disconnect();
                this.lastObserver = new ResizeObserver(() => {
                    this.update();
                });
                this.lastObserver.observe(this.effectiveElement());
            });
        }
    }

    ngOnDestroy() {
        this.lastObserver?.disconnect();
        this.lastMutationObserver?.disconnect();
    }

    ngOnInit() {
        // this.update.update(v => v + 1);
    }

    ngAfterViewInit() {
        this.update();
    }
}

/**
 * Directive to mark an element as a hidden container for the adaptive container.
 * If defined, adaptive-container uses this element to place hidden elements into it.
 *
 * ```html
 * <dui-adaptive-container>
 *     <dui-button>Button 1</dui-button>
 *     <dui-button>Button 2</dui-button>
 *     <dui-dropdown>
 *       <div *dropdownContainer duiAdaptiveHiddenContainer></ng-container>
 *     </dui-dropdown>
 * </dui-adaptive-container>
 * ```
 */
@Directive({
    selector: '[duiAdaptiveHiddenContainer]',
    standalone: true,
})
export class AdaptiveHiddenContainer implements OnDestroy {
    constructor(
        private host: ElementRef,
        private container: AdaptiveContainerComponent,
    ) {
        container.registerHiddenContainer(host.nativeElement);
    }

    ngOnDestroy() {
        this.container.unregisterHiddenContainer(this.host.nativeElement);
    }
}

export function getPadding(rect: DOMRect, direction: 'row' | 'column' | 'row-reverse' | 'column-reverse'): string {
    switch (direction) {
        case 'row':
            return `0 ${rect.width}px 0 0`;
        case 'column':
            return `0 0 ${rect.height}px 0`;
        case 'row-reverse':
            return `0 0 0 ${rect.width}px`;
        case 'column-reverse':
            return `${rect.height}px 0 0 0`;
    }
}

function isOverflowing(element: HTMLElement, vertical: boolean): boolean {
    return vertical ? element.scrollHeight > element.clientHeight : element.scrollWidth > element.clientWidth;
}

function isHidden(
    elementOrPlaceholder: DuiAdaptiveElement | DuiAdaptivePlaceholder,
    hiddenContainer: HTMLElement | undefined,
): boolean {
    const element = elementOrPlaceholder instanceof Comment ? elementOrPlaceholder.duiElement : elementOrPlaceholder;
    if (element.parentElement === hiddenContainer) return true;
    return element.style.display === 'none';
}

function hideElement(
    elementOrPlaceholder: DuiAdaptiveElement | DuiAdaptivePlaceholder,
    hiddenContainer: HTMLElement | undefined,
) {
    const element = elementOrPlaceholder instanceof Comment ? elementOrPlaceholder.duiElement : elementOrPlaceholder;
    element.style.display = 'none';
    if (!element.parentElement) return;

    if (!element.duiPlaceholder) {
        const comment = Object.assign(document.createComment('dui-adaptive-placeholder'), {
            duiElement: element,
        }) as DuiAdaptivePlaceholder;
        element.duiPlaceholder = comment;
        element.parentElement.insertBefore(comment, element);
    }
    if (hiddenContainer && element.parentElement !== hiddenContainer) {
        hiddenContainer.insertBefore(element, hiddenContainer.firstChild);
        element.style.display = '';
    }
}

function showElement(elementOrPlaceholder: DuiAdaptiveElement | DuiAdaptivePlaceholder, visibleContainer: HTMLElement) {
    const element = elementOrPlaceholder instanceof Comment ? elementOrPlaceholder.duiElement : elementOrPlaceholder;
    element.style.display = '';
    if (!element.parentElement) return;

    if (element.duiPlaceholder) {
        // Move the element back to the visible container, keep the comment for later
        visibleContainer.insertBefore(element, element.duiPlaceholder);
    }
}

function getState(visibleContainer: HTMLElement) {
    const nodes: (DuiAdaptiveElement | DuiAdaptivePlaceholder)[] = [];
    const fallbacks: HTMLElement[] = [];
    for (let i = 0; i < visibleContainer.childNodes.length; i++) {
        const node = visibleContainer.childNodes[i];
        if (node instanceof HTMLElement) {
            if (node.classList.contains('dui-adaptive-fallback')) {
                fallbacks.push(node);
            } else {
                nodes.push(node);
            }
        } else if (isAdaptivePlaceholder(node)) {
            // Referenced element is already part of visibleContainer, so skip it
            // so that we don't have it twice.
            if (node.duiElement.parentElement === visibleContainer) continue;

            // TODO: Check of node.duiElement is still attached to the DOM, if not
            //  remove the comment as well and ignore it
            nodes.push(node as DuiAdaptivePlaceholder);
        }
    }
    return { nodes, fallbacks };
}
