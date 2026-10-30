/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

declare global {
    /**
     * This is mainly for code completion.
     */
    namespace JSX {
        type IfEquals<X, Y, A, B> =
            (<T>() => T extends X ? 1 : 2) extends
            (<T>() => T extends Y ? 1 : 2) ? A : B;

        type WritableKeysOf<T> = {
            [P in keyof T]: IfEquals<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, P, never>
        }[keyof T];

        type NoFunctions<T> = { [P in keyof T]: T[P] extends ((...args: any[]) => any) ? never : P }[keyof T];

        type ExtractProps<T> = {
            [P in Extract<NoFunctions<T>, WritableKeysOf<T>>]?: T[P] extends string | number | Date | boolean ? T[P] : any;
        } & { [name: string]: any; class?: string };


        interface IntrinsicElements {
            'a': ExtractProps<HTMLAnchorElement>;
            'abbr': ExtractProps<HTMLElement>;
            'address': ExtractProps<HTMLElement>;
            'area': ExtractProps<HTMLAreaElement>;
            'article': ExtractProps<HTMLElement>;
            'aside': ExtractProps<HTMLElement>;
            'audio': ExtractProps<HTMLAudioElement>;
            'b': ExtractProps<HTMLElement>;
            'base': ExtractProps<HTMLBaseElement>;
            'bdi': ExtractProps<HTMLElement>;
            'bdo': ExtractProps<HTMLElement>;
            'blockquote': ExtractProps<HTMLQuoteElement>;
            'body': ExtractProps<HTMLBodyElement>;
            'br': ExtractProps<HTMLBRElement>;
            'button': ExtractProps<HTMLButtonElement>;
            'canvas': ExtractProps<HTMLCanvasElement>;
            'caption': ExtractProps<HTMLTableCaptionElement>;
            'cite': ExtractProps<HTMLElement>;
            'code': ExtractProps<HTMLElement>;
            'col': ExtractProps<HTMLTableColElement>;
            'colgroup': ExtractProps<HTMLTableColElement>;
            'data': ExtractProps<HTMLDataElement>;
            'datalist': ExtractProps<HTMLDataListElement>;
            'dd': ExtractProps<HTMLElement>;
            'del': ExtractProps<HTMLModElement>;
            'details': ExtractProps<HTMLDetailsElement>;
            'dfn': ExtractProps<HTMLElement>;
            'dialog': ExtractProps<HTMLDialogElement>;
            'dir': ExtractProps<HTMLDirectoryElement>;
            'div': ExtractProps<HTMLDivElement>;
            'dl': ExtractProps<HTMLDListElement>;
            'dt': ExtractProps<HTMLElement>;
            'em': ExtractProps<HTMLElement>;
            'embed': ExtractProps<HTMLEmbedElement>;
            'fieldset': ExtractProps<HTMLFieldSetElement>;
            'figcaption': ExtractProps<HTMLElement>;
            'figure': ExtractProps<HTMLElement>;
            'font': ExtractProps<HTMLFontElement>;
            'footer': ExtractProps<HTMLElement>;
            'form': ExtractProps<HTMLFormElement>;
            'frame': ExtractProps<HTMLFrameElement>;
            'frameset': ExtractProps<HTMLFrameSetElement>;
            'h1': ExtractProps<HTMLHeadingElement>;
            'h2': ExtractProps<HTMLHeadingElement>;
            'h3': ExtractProps<HTMLHeadingElement>;
            'h4': ExtractProps<HTMLHeadingElement>;
            'h5': ExtractProps<HTMLHeadingElement>;
            'h6': ExtractProps<HTMLHeadingElement>;
            'head': ExtractProps<HTMLHeadElement>;
            'header': ExtractProps<HTMLElement>;
            'hgroup': ExtractProps<HTMLElement>;
            'hr': ExtractProps<HTMLHRElement>;
            'html': ExtractProps<HTMLHtmlElement>;
            'i': ExtractProps<HTMLElement>;
            'iframe': ExtractProps<HTMLIFrameElement>;
            'img': ExtractProps<HTMLImageElement>;
            'input': ExtractProps<HTMLInputElement>;
            'ins': ExtractProps<HTMLModElement>;
            'kbd': ExtractProps<HTMLElement>;
            'label': ExtractProps<HTMLLabelElement>;
            'legend': ExtractProps<HTMLLegendElement>;
            'li': ExtractProps<HTMLLIElement>;
            'link': ExtractProps<HTMLLinkElement>;
            'main': ExtractProps<HTMLElement>;
            'map': ExtractProps<HTMLMapElement>;
            'mark': ExtractProps<HTMLElement>;
            'marquee': ExtractProps<HTMLMarqueeElement>;
            'menu': ExtractProps<HTMLMenuElement>;
            'meta': ExtractProps<HTMLMetaElement>;
            'meter': ExtractProps<HTMLMeterElement>;
            'nav': ExtractProps<HTMLElement>;
            'noscript': ExtractProps<HTMLElement>;
            'object': ExtractProps<HTMLObjectElement>;
            'ol': ExtractProps<HTMLOListElement>;
            'optgroup': ExtractProps<HTMLOptGroupElement>;
            'option': ExtractProps<HTMLOptionElement>;
            'output': ExtractProps<HTMLOutputElement>;
            'p': ExtractProps<HTMLParagraphElement>;
            'param': ExtractProps<HTMLParamElement>;
            'picture': ExtractProps<HTMLPictureElement>;
            'pre': ExtractProps<HTMLPreElement>;
            'progress': ExtractProps<HTMLProgressElement>;
            'q': ExtractProps<HTMLQuoteElement>;
            'rp': ExtractProps<HTMLElement>;
            'rt': ExtractProps<HTMLElement>;
            'ruby': ExtractProps<HTMLElement>;
            's': ExtractProps<HTMLElement>;
            'samp': ExtractProps<HTMLElement>;
            'script': ExtractProps<HTMLScriptElement>;
            'section': ExtractProps<HTMLElement>;
            'select': ExtractProps<HTMLSelectElement>;
            'slot': ExtractProps<HTMLSlotElement>;
            'small': ExtractProps<HTMLElement>;
            'source': ExtractProps<HTMLSourceElement>;
            'span': ExtractProps<HTMLSpanElement>;
            'strong': ExtractProps<HTMLElement>;
            'style': ExtractProps<HTMLStyleElement>;
            'sub': ExtractProps<HTMLElement>;
            'summary': ExtractProps<HTMLElement>;
            'sup': ExtractProps<HTMLElement>;
            'table': ExtractProps<HTMLTableElement>;
            'tbody': ExtractProps<HTMLTableSectionElement>;
            'td': ExtractProps<HTMLTableDataCellElement>;
            'template': ExtractProps<HTMLTemplateElement>;
            'textarea': ExtractProps<HTMLTextAreaElement>;
            'tfoot': ExtractProps<HTMLTableSectionElement>;
            'th': ExtractProps<HTMLTableHeaderCellElement>;
            'thead': ExtractProps<HTMLTableSectionElement>;
            'time': ExtractProps<HTMLTimeElement>;
            'title': ExtractProps<HTMLTitleElement>;
            'tr': ExtractProps<HTMLTableRowElement>;
            'track': ExtractProps<HTMLTrackElement>;
            'u': ExtractProps<HTMLElement>;
            'ul': ExtractProps<HTMLUListElement>;
            'var': ExtractProps<HTMLElement>;
            'video': ExtractProps<HTMLVideoElement>;
            'wbr': ExtractProps<HTMLElement>;
        }
    }
}

export {};
