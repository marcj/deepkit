/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { ClassType, getClassName, isArray, isClass } from '@deepkit/core';
import './optimize-tsx.js';
import { injectedFunction, Injector, Resolver } from '@deepkit/injector';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';
import { escapeAttribute, escapeHtml, safeString } from './utils.js';
import { ReflectionClass, Type } from '@deepkit/type';

export type Attributes<T = any> = {
    [P in keyof T]: T[P];
} & { children?: (ElementStruct | string)[] | ElementStruct | string };

export abstract class ElementClass {
    constructor(protected attributes: Attributes) {
    }

    abstract render(): Element;
}

interface HtmlString {
    htmlString: string;
}

/**
 * Tell the template engine to not automatically escape the HTML in the given string.
 * Per default all dynamic values are automatically HTML escaped.
 *
 * This is dangerous: Always validate data that you pass as `string` otherwise this can lead
 * to Cross-Side Scripting attacks.
 */
export function html(string: string | HtmlString) {
    return isHtmlString(string) ? string : { htmlString: string };
}

function isHtmlString(obj: any): obj is HtmlString {
    return 'object' === typeof obj && 'string' === typeof obj.htmlString;
}

export interface ElementFn {
    (attributes: Attributes, children: HtmlString | string): Element;
}

export type Element = string | ElementFn | ClassType<ElementClass> | Element[];

export const voidElements: { [name: string]: true } = {
    area: true,
    base: true,
    br: true,
    col: true,
    command: true,
    embed: true,
    hr: true,
    img: true,
    input: true,
    keygen: true,
    link: true,
    meta: true,
    param: true,
    source: true,
    track: true,
    wbr: true,
};

type ElementStructChildren = HtmlString | ElementStruct | string | SafeString;

export type ElementStruct = { render: string | ElementFn, attributes: Attributes | null | string, children: ElementStructChildren | ElementStructChildren[], childrenEscaped?: ElementStructChildren[] | string };

export type SafeString = { [safeString]: string };

export function isElementStruct(v: any): v is ElementStruct {
    return 'object' === typeof v && v.hasOwnProperty('render') && v.hasOwnProperty('attributes') && !v.slice;
}

export function isSafeString(v: any): v is SafeString {
    return 'object' === typeof v && v.hasOwnProperty(safeString);
}

async function renderChildren(injector: Injector, contents: ElementStructChildren[], stopwatch?: Stopwatch, autoEscape: boolean = true): Promise<string> {
    let children = '';
    //this is 3x faster than contents.join('')
    // for (const content of struct.contents) {
    for (const item of contents) {
        if (item === undefined) continue;
        if (isArray(item)) {
            children += await renderChildren(injector, item, stopwatch);
        } else {
            if (isSafeString(item)) {
                children += item[safeString];
            } else if (isElementStruct(item)) {
                children += await render(injector, item, stopwatch);
            } else {
                if ((item as any).htmlString) {
                    children += (item as any).htmlString;
                } else {
                    children += autoEscape ? escapeHtml(item as string) : item as string;
                }
            }
        }
    }

    return children;
}

interface TemplateCacheCall {
    templateCall?(attributes: any, ...args: any[]): any;
}

export async function render(injector: Injector, struct: ElementStruct | string | (ElementStruct | string)[], stopwatch?: Stopwatch): Promise<any> {
    if ('string' === typeof struct) {
        return struct;
    } else if ((struct as any).htmlString) {
        return (struct as any).htmlString;
    } else if (isSafeString(struct)) {
        return struct[safeString];
    } else if (isArray(struct)) {
        return await renderChildren(injector, struct, stopwatch);
    }

    let children: string = '';
    if (struct.childrenEscaped) {
        if ('string' === typeof struct.childrenEscaped) return struct.childrenEscaped;
        return await renderChildren(injector, struct.childrenEscaped, stopwatch);
    } else if (struct.children) {
        if (isArray(struct.children)) {
            children = await renderChildren(injector, struct.children, stopwatch);
        } else {
            children = await renderChildren(injector, [struct.children], stopwatch);
        }
    } else if (struct.attributes && 'string' !== typeof struct.attributes && struct.attributes?.children) {
        if (isArray(struct.attributes.children)) {
            children = await renderChildren(injector, struct.attributes.children, stopwatch);
        } else {
            children = await renderChildren(injector, [struct.attributes.children], stopwatch);
        }
    }

    if (undefined === struct.render) {
        return children;
    }

    if ('string' === typeof struct.render) {
        const tag = struct.render;
        let res = '<' + tag;
        if (struct.attributes === null) {
        } else if ('string' === typeof struct.attributes) {
            if (struct.attributes) {
                res += ' ' + struct.attributes;
            }
        } else {
            for (const i in struct.attributes) {
                if (i === 'children') continue;
                const attributeValue = struct.attributes[i];
                const v = isHtmlString(attributeValue) ? attributeValue.htmlString : escapeAttribute(attributeValue);
                res += ' ' + i + '="' + v + '"';
            }
        }
        if (voidElements[tag]) {
            res += '/>';
        } else {
            res += '>' + children + '</' + tag + '>';
        }
        return res;
    }

    if (isClass(struct.render)) {
        const element = struct.render as any as ClassType & TemplateCacheCall;
        if (!element.templateCall) {
            const schema = ReflectionClass.from(struct.render);
            const args: Resolver<any>[] = [];
            const types = schema.getMethodParameters('constructor');
            for (let i = 2; i < types.length; i++) {
                args.push(injector.getResolver(types[i].type as Type));
            }

            element.templateCall = (attributes: any, children: any) => {
                return new element(attributes, children, ...(args.map(v => v())));
            };
        }
        const instance = element.templateCall(struct.attributes || {}, html(children));

        if (stopwatch) {
            const frame = stopwatch.start(getClassName(struct.render), FrameCategory.template);
            try {
                return await render(injector, await instance.render(struct.attributes || {}, html(children)), stopwatch);
            } finally {
                frame.end();
            }
        }
        return await render(injector, await instance.render(struct.attributes || {}, html(children)), stopwatch);
    }

    if ('function' === typeof struct.render) {
        const frame = stopwatch?.start(struct.render.name, FrameCategory.template);
        const element = struct.render as ((...args: any) => any) & TemplateCacheCall;
        if (!element.templateCall) {
            element.templateCall = injectedFunction(element, injector, 2);
        }

        try {
            const res = await element.templateCall!(undefined, struct.attributes as any || {}, html(children));
            if (isElementStruct(res)) {
                return await render(injector, res, stopwatch);
            } else {
                return res + '';
            }
        } finally {
            frame?.end();
        }
    }

    return '';
}

export function createElement(element: Element, attributes?: Attributes | null, ...children: (string | ElementStruct | HtmlString)[]) {
    return { render: element, attributes, children };
}
