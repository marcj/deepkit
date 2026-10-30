/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { generate } from 'astring';
import { parseModule } from 'meriyah';
import Module from 'node:module';
import { extname, resolve } from 'node:path';
import type {
    ArrayExpression,
    ArrayPattern,
    AssignmentPattern,
    BinaryExpression,
    CallExpression,
    Expression,
    Identifier,
    Literal,
    MemberExpression,
    Node,
    ObjectExpression,
    ObjectPattern,
    Property,
    RestElement,
    SpreadElement,
    UnaryExpression
} from 'estree';
import { inDebugMode } from '@deepkit/core';
import { escape, escapeHtml } from './utils.js';
import { voidElements } from './template.js';

export function transform(code: string, filename: string) {
    if (inDebugMode()) return code;
    //for CommonJs its jsx_runtime_1.jsx, for ESM its _jsx. ESM is handled in loader.ts#transformSource
    if (code.indexOf('.jsx(') === -1 && code.indexOf('.jsxs(') === -1) return code;
    // console.log('optimize code for', filename, optimizeJSX(code));
    return optimizeJSX(code);
}

const nodeModulesRegex = /^(?:.*[\\/])?node_modules(?:[\\/].*)?$/;

/**
 * Registers a CommonJS require hook that transforms the code of all files with the given extensions
 * (except in node_modules) before they are compiled.
 */
function addRequireHook(hook: (code: string, filename: string) => string, exts: string[]) {
    const extensions = (Module as any)._extensions;
    const originalJSLoader = extensions['.js'];
    for (const ext of exts) {
        const oldLoader = extensions[ext] || originalJSLoader;
        extensions[ext] = function (mod: any, filename: string) {
            if (exts.includes(extname(filename)) && !nodeModulesRegex.test(resolve(filename))) {
                const compile = mod._compile;
                mod._compile = function (code: string) {
                    mod._compile = compile;
                    return mod._compile(hook(code, filename), filename);
                };
            }
            oldLoader(mod, filename);
        };
    }
}

addRequireHook(transform, ['.js', '.tsx']);

class NotSerializable {
}

function parse(code: string): Node {
    return parseModule(code) as any;
}

function isNode(value: any): value is Node {
    return value !== null && typeof value === 'object' && typeof value.type === 'string';
}

/**
 * Calls enter for each node of the tree (depth-first, parents before children) and replaces the node
 * with the returned one. Children of the returned node are visited afterwards.
 */
function replace(node: Node, enter: (node: Node) => Node): Node {
    node = enter(node) || node;
    for (const key of Object.keys(node)) {
        const child = (node as any)[key];
        if (Array.isArray(child)) {
            for (let i = 0; i < child.length; i++) {
                if (isNode(child[i])) child[i] = replace(child[i], enter);
            }
        } else if (isNode(child)) {
            (node as any)[key] = replace(child, enter);
        }
    }
    return node;
}

export function parseCode(code: string) {
    return parse(code);
}

export function generateCode(ast: Node) {
    return generate(ast);
}

function serializeValue(node: Literal | UnaryExpression): any {
    if (node.type === 'Literal') {
        return node.value;
    }

    if (node.type === 'UnaryExpression' && node.argument?.type === 'Literal') {
        return node.argument.value;
    }

    return NotSerializable;
}

/**
 * Our strategy is to convert ObjectExpressions to a BinaryExpression that has basically like
 *
 *      p1 + '=' + p1Value + ' ' + p2 + '=' + p2Value + ...
 *
 * concatExpressions() can then further optimise it down to one big literal (or several literals depending on where non-literals are used).
 */
function optimizeAttributes(jsxRuntime: string, node: ObjectExpression): any {
    const expressions: ConcatableType[] = [];

    for (const p of node.properties) {
        if (p.type === 'SpreadElement') return node;
        if (isPattern(p.value)) return node;

        const value = p.value.type === 'UnaryExpression' ? p.value.argument : p.value;

        if (expressions.length) {
            expressions.push(createEscapedLiteral(' '));
        }
        if (p.key.type === 'Identifier') {
            expressions.push(createEscapedLiteral(p.key.name));
        } else {
            expressions.push(p.key);
        }
        expressions.push(createEscapedLiteral('="'));

        if (value.type !== 'Literal' && !isPattern(value) && !isCreateElementCall(value) && !isEscapeCall(value) && !isHtmlCall(value)) {
            expressions.push(toSafeString(jsxRuntime, toEscapeAttributeCall(jsxRuntime, value)));
        } else {
            if (value.type === 'Literal') {
                expressions.push(createEscapedLiteral(value.value));
            } else {
                expressions.push(value);
            }
        }
        expressions.push(createEscapedLiteral('"'));
    }

    if (expressions.length >= 2) return concatExpressions(jsxRuntime, expressions);
    return createEscapedLiteral('');
}

function isPattern(e: Node): e is ObjectPattern | ArrayPattern | RestElement | AssignmentPattern | MemberExpression {
    return e.type === 'ArrayPattern' || e.type === 'ObjectPattern' || e.type === 'AssignmentPattern' || e.type === 'RestElement' || e.type === 'MemberExpression';
}

//jsx_runtime_1.jsx()
function isCjsJSXCall(node: Node): boolean {
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const expression = node.callee;
        return expression.property && expression.property.type === 'Identifier' && (expression.property.name === 'jsx' || expression.property?.name === 'jsxs');
    }
    return false;
}

function unwrapCallExpression(node: Node): MemberExpression | Identifier | undefined {
    if (node.type === 'CallExpression' && node.callee.type === 'SequenceExpression'
        && node.callee.expressions[0] && node.callee.expressions[0].type === 'Literal' && node.callee.expressions[0].value === 0
        && node.callee.expressions[1]) {
        if (node.callee.expressions[1].type === 'MemberExpression') return node.callee.expressions[1];
        if (node.callee.expressions[1].type === 'Identifier') return node.callee.expressions[1];
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        return node.callee;
    }
    return;
}

//(0, jsx_runtime_1.jsx)
function isAvoidedThisCjsJSXCall(node: Node): boolean {
    const expression = unwrapCallExpression(node);
    if (expression && expression.type === 'MemberExpression') {
        return !!expression.property && expression.property.type === 'Identifier' && (expression.property.name === 'jsx' || expression.property?.name === 'jsxs');
    }
    return false;
}

function isESMJSXCall(node: Node): boolean {
    return node.type === 'CallExpression' && node.callee.type === 'Identifier' && (node.callee.name === '_jsx' || node.callee.name === '_jsxs');
}

/**
 * We convert
 *
 * _jsx.createElement("div", { id: "123" }, void 0)
 * -> "<div id=\"123\"></div>"
 *
 * _jsx.createElement("div", { children: "Test" }, void 0)
 * -> "<div>Test</div>"
 *
 * _jsx.createElement("div", Object.assign({ id: "123" }, { children: "Test" }), void 0)
 * -> "<div id=\"123\">Test</div>"
 *
 * _jsx.createElement("div", Object.assign({ id: "123" }, { children: _jsx.createElement('b", { children: "strong' }, void 0) }), void 0);
 * -> "<div id=\"123\">" + "<b>strong</b>" + "</div>"
 */
function optimizeNode(node: Expression, root: boolean = true): Expression {
    if (node.type !== 'CallExpression') return node;
    if (node.callee.type !== 'MemberExpression') return node;
    if (node.callee.object.type !== 'Identifier') return node;

    const isCreateElementExpression = node.callee.property.type === 'Identifier' && node.callee.property?.name === 'createElement';
    if (!isCreateElementExpression) return node;

    const jsxRuntime = node.callee.object.name;

    //if first argument is a Fragment, we optimise for that
    if (node.arguments[0].type === 'MemberExpression' && node.arguments[0].object.type === 'Identifier'
        && node.arguments[0].property.type === 'Identifier' && node.arguments[0].property.name === 'Fragment') {
        //we normalize Fragments (or all createElement(var)) to have as second parameter the attributes.
        //since Fragments don't have attributes, this is always an empty object, so we skip that

        const concat: Expression[] = [];
        let optimisedString: boolean = true;
        let strings: string[] = [];
        for (let i = 2; i < node.arguments.length; i++) {
            const a = node.arguments[i];
            if (a && a.type !== 'SpreadElement') {
                const o = optimizeNode(a, false);
                concat.push(o);
                const staticString = extractStaticString(o);
                if (staticString !== noStaticValue) {
                    strings.push(staticString);
                } else {
                    optimisedString = false;
                }
            }
        }

        //all arguments are string literals, which can merge to one big string
        const result = optimisedString ? createEscapedLiteral(strings.join('')) : concatExpressions(jsxRuntime, concat);
        const safeString = getSafeString(result);
        if (safeString !== undefined) {
            if (root) return createRenderObjectWithEscapedChildren(safeString);
            return safeString;
        }
        if (root) return createRenderObjectWithEscapedChildren(result);
        return result;
    }

    //go deeper if possible
    for (let i = 2; i < node.arguments.length; i++) {
        const a = node.arguments[i];
        if (a && a.type === 'CallExpression') {
            node.arguments[i] = optimizeNode(a, false);
        }
    }

    let tag: any = '';
    //we only optimize attributes when we have createElement(string)
    if (node.arguments[0].type === 'Literal') {
        tag = node.arguments[0].value;

        const attributes = node.arguments[1];

        if (isObjectAssignCall(attributes)) {
            //when we have here Object.assign still, then it includes a spread operator, which we can't optimise.
            return node;
        } else {
            if (node.arguments[1] && node.arguments[1].type === 'ObjectExpression') {
                const ori = node.arguments[1];
                node.arguments[1] = optimizeAttributes(jsxRuntime, ori);
                if (ori === node.arguments[1]) {
                    //we did not change the attributes to a better option, so we stop optimizing further.
                    return node;
                }
            }
        }
    }

    //check if we can concatenate (+) arguments
    let canBeConcatenated = true;
    for (let i = 1; i < node.arguments.length; i++) {
        const a = node.arguments[i];
        if (a && a.type !== 'SpreadElement' && !isConcatenatable(a)) {
            canBeConcatenated = false;
            break;
        }
    }

    if (canBeConcatenated) {
        const args = node.arguments as (Literal | CallExpression)[];
        const attributes = args[1];

        const concat: Expression[] = [];
        const closing = voidElements[tag] ? '/>' : '>';
        if (tag) {
            if (attributes.type === 'Literal' && !attributes.value) {
                //no attributes
                concat.push(createEscapedLiteral('<' + tag + closing));
            } else {
                concat.push(createEscapedLiteral('<' + tag + ' '));
                concat.push(attributes);
                concat.push(createEscapedLiteral(closing));
            }
        }

        for (let i = 2; i < node.arguments.length; i++) {
            let e = node.arguments[i];
            if (e.type !== 'SpreadElement') {
                concat.push(e);
            }
        }

        if (tag && closing === '>') {
            concat.push(createEscapedLiteral('</' + tag + '>'));
        }

        if (concat.length === 0) {
            return node;
        }

        if (node.arguments[0].type !== 'Literal') {
            //for custom elements, we only merge its  arguments
            if (node.arguments[2]) {
                node.arguments[2] = optimiseArguments(jsxRuntime, concat, false);
                node.arguments.splice(3);
            }
            //todo: convert to {render:, attributes:, children: }
            return node;
        }

        // //concatExpressions tries to convert everything to one big literal if possible
        // //alternatively returns an renderObject expression with array children.
        return optimiseArguments(jsxRuntime, concat, root);
    }

    return node;
}

function optimiseArguments(jsxRuntime: string, expressions: ConcatableType[], root: boolean): Expression {
    if (expressions.length === 0) throw new Error('No expression for optimise arguments');

    if (expressions.length === 1) {
        const e = expressions[0];
        const htmlArg = getHtmlCallArg(e);
        const value = htmlArg ? extractStaticString(htmlArg) : extractStaticString(e);
        if (value !== noStaticValue) {
            expressions[0] = toSafeString(jsxRuntime, createEscapedLiteral(value));
        }
    }

    const result = expressions.length === 1 ? toOptimisedArrayExpression(expressions) : concatExpressions(jsxRuntime, expressions);

    const safeString = getSafeString(result);
    if (safeString !== undefined) {
        if (root) return createRenderObjectWithEscapedChildren(safeString);
        return safeString;
    }
    if (root) return createRenderObjectWithEscapedChildren(result);
    return result;
}

function concatExpressions(jsxRuntime: string, expressions: ConcatableType[]): ConcatableType {
    if (expressions.length < 2) {
        console.dir(expressions, { depth: null });
        throw new Error('concatExpressions requires at least 2 expressions');
    }

    const normalizedExpressions: ConcatableType[] = [];

    //todo: can this BinaryExpression check be entirely be removed?
    for (let e of expressions) {
        if (e.type === 'BinaryExpression' && !isOptimisedBinaryExpression(e)) {
            //check if its ours BinaryExpression from concatExpressions. If so do not merge.
            //we merge later at the end of the pipeline

            //unwrap existing binaryExpression to avoid brackets: a + (b + (c + d)) + e
            for (const a of extractBinaryExpressions(e)) {
                normalizedExpressions.push(a);
            }
        } else if (isOptimisedArrayExpression(e)) {
            for (const a of e.elements) {
                if (a.type === 'SpreadElement') continue;
                normalizedExpressions.push(a);
            }
        } else {
            normalizedExpressions.push(e);
        }
    }

    function mergeLiterals(expression: Expression[]): ConcatableType[] {
        const result: ConcatableType[] = [];
        let lastLiteral: Literal | undefined;

        //try to optimise static values together
        for (let e of expression) {
            if (e.type === 'Literal' && !(e as any).escape) {
                //we need to escape it
                e.value = escapeHtml(e.value);
                (e as any).escape = true;
            }

            const htmlArg = getHtmlCallArg(e);
            const value = htmlArg ? extractStaticString(htmlArg) : extractStaticString(e);

            if (value === noStaticValue) {
                lastLiteral = undefined;
                result.push(e);
            } else {
                if (lastLiteral) {
                    lastLiteral.value += value;
                } else {
                    lastLiteral = createEscapedLiteral(value);
                    result.push(toSafeString(jsxRuntime, lastLiteral));
                }
            }
        }
        return result;
    }

    let optimizedExpressions = mergeLiterals(normalizedExpressions);

    if (optimizedExpressions.length === 1) {
        return optimizedExpressions[0];
    }

    const allExpressionsConcatable = optimizedExpressions.every(e => {
        return isOptimisedBinaryExpression(e) || isHtmlCall(e) || isSafeCall(e) || isEscapedLiteral(e) || getSafeString(e) !== undefined || isUserEscapeCall(e) || isOptimisedHtmlString(e);
    });

    const lastStep: ConcatableType[] = [];

    for (let e of optimizedExpressions) {
        if (e.type === 'BinaryExpression') {
            //unwrap existing binaryExpression to avoid brackets: a + (b + (c + d)) + e
            for (const a of extractBinaryExpressions(e)) {
                lastStep.push(a);
            }
        } else {
            lastStep.push(e);
        }
    }
    optimizedExpressions = mergeLiterals(lastStep);

    // console.log('allExpressionsConcatable', allExpressionsConcatable);
    // console.dir(optimizedExpressions, { depth: null });

    if (!allExpressionsConcatable) {
        //we can't optimise this as one big binary expression
        //we have to return it as array
        return toOptimisedArrayExpression(optimizedExpressions);
    }

    let lastBinaryExpression: OptimisedBinaryExpression | undefined;
    for (let i = 1; i < optimizedExpressions.length; i++) {
        lastBinaryExpression = {
            type: 'BinaryExpression',
            _optimised: true,
            left: lastBinaryExpression || normalizeLastStep(optimizedExpressions[0]),
            right: normalizeLastStep(optimizedExpressions[i]),
            operator: '+',
        };
    }

    if (!lastBinaryExpression) throw new Error('Could not build binary expression');

    return lastBinaryExpression;
}

function normalizeLastStep(e: Expression): Expression {
    const safeCallArg = getSafeCallArg(e);
    if (safeCallArg !== undefined) return safeCallArg;

    const safeString = getSafeString(e);
    if (safeString !== undefined) return safeString;

    const htmlCall = getHtmlCallArg(e);
    if (htmlCall !== undefined) return htmlCall;

    if (isUserEscapeCall(e) || isHtmlCall(e)) {
        //convert from `escape(e)` to `escape(e).htmlString`
        //and from `html(e)` to `html(e).htmlString`
        return {
            type: 'MemberExpression',
            object: e,
            computed: false,
            property: { type: 'Identifier', name: 'htmlString' }
        } as MemberExpression;
    }

    return e;
}

function toOptimisedArrayExpression(expressions: ConcatableType[]): ArrayExpression {
    const arrayExpression: OptimisedArrayExpression = {
        type: 'ArrayExpression',
        _optimised: true,
        elements: [],
    };
    for (let e of expressions) {
        arrayExpression.elements.push(e);
    }
    return arrayExpression;
}


function createRenderObjectWithEscapedChildren(children?: Expression, render: Expression = { type: 'Identifier', name: 'undefined' }, attributes: Expression = {
    type: 'Identifier',
    name: 'undefined'
}): Expression {
    const o: ObjectExpression = {
        type: 'ObjectExpression',
        properties: [
            {
                type: 'Property',
                key: { type: 'Identifier', name: 'render' },
                value: render,
                kind: 'init',
                computed: false,
                method: false,
                shorthand: false
            },
            {
                type: 'Property',
                key: { type: 'Identifier', name: 'attributes' },
                value: attributes,
                kind: 'init',
                computed: false,
                method: false,
                shorthand: false
            }
        ]
    };

    if (children) {
        o.properties.push({
            type: 'Property',
            key: { type: 'Identifier', name: 'childrenEscaped' },
            value: children,
            kind: 'init',
            computed: false,
            method: false,
            shorthand: false
        });
    }

    return o;
}

function isRenderObject(e: Node) {
    return e.type === 'ObjectExpression' && e.properties[0] && e.properties[0].type === 'Property'
        && e.properties[0].key.type === 'Identifier' && e.properties[0].key.name === 'render'
        ;
}

function isObjectAssignCall(e: Node) {
    return e.type === 'CallExpression' && e.callee.type === 'MemberExpression'
        && e.callee.object.type === 'Identifier' && e.callee.object.name === 'Object'
        && e.callee.property.type === 'Identifier' && e.callee.property.name === 'assign'
        ;
}

function createEscapedLiteral(v: string | number | boolean | null | RegExp | undefined): Literal {
    return { type: 'Literal', value: v, escape: true } as any;
}

function isEscapedLiteral(e: Node): boolean {
    return e.type === 'Literal' && (e as any).escape === true;
}

function isCreateElementCall(e: Node) {
    return e.type === 'CallExpression' && e.callee.type === 'MemberExpression'
        && e.callee.object.type === 'Identifier'
        && e.callee.property.type === 'Identifier' && e.callee.property.name === 'createElement';
}

function isConcatenatable(e: Expression): boolean {
    return extractStaticString(e) !== undefined || e.type === 'Identifier';
}

function toHtmlCall(jsxRuntime: string, expression: Expression): CallExpression {
    return {
        type: 'CallExpression',
        callee: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: jsxRuntime },
            computed: false,
            optional: false,
            property: { type: 'Identifier', name: 'html' }
        },
        optional: false,
        arguments: [expression]
    };
}

// function toEscapeCall(jsxRuntime: string, expression: Expression): CallExpression {
//     return {
//         type: 'CallExpression',
//         callee: {
//             type: 'MemberExpression',
//             object: { type: 'Identifier', name: jsxRuntime },
//             computed: false,
//             optional: false,
//             property: { type: 'Identifier', name: 'escape' }
//         },
//         optional: false,
//         arguments: [expression]
//     };
// }

function toEscapeAttributeCall(jsxRuntime: string, expression: Expression): CallExpression {
    return {
        type: 'CallExpression',
        callee: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: jsxRuntime },
            computed: false,
            optional: false,
            property: { type: 'Identifier', name: 'escapeAttribute' }
        },
        optional: false,
        arguments: [expression]
    };
}

export const noStaticValue: unique symbol = Symbol('');

export function extractStaticString(e: Expression | SpreadElement): string | typeof noStaticValue {
    if (e.type === 'Literal') return '' + e.value;
    if (e.type === 'TemplateLiteral' && e.expressions.length === 0) {
        return e.quasis.map(v => v.value.cooked).join('');
    }

    const safeString = getSafeString(e);
    if (safeString !== undefined) return extractStaticString(safeString);

    return noStaticValue;
}

function unwrapSpread(e: Expression | SpreadElement): Expression {
    return e.type === 'SpreadElement' ? e.argument : e;
}

function isHtmlCall(object: Expression | SpreadElement): boolean {
    return getHtmlCallArg(object) !== undefined;
}

function getHtmlCallArg(e: Expression | SpreadElement): Expression | undefined {
    const expression = unwrapCallExpression(e);
    if (!expression) return;
    if (e.type === 'CallExpression' && expression.type === 'MemberExpression'
        && expression.object.type === 'Identifier' && expression.object.name === '_jsx'
        && expression.property.type === 'Identifier' && expression.property.name === 'html'
        && e.arguments[0]) return unwrapSpread(e.arguments[0]);

    if (e.type === 'CallExpression' && expression.type === 'MemberExpression'
        && expression.object.type === 'Identifier'
        && expression.property.type === 'Identifier' && expression.property.name === 'html'
        && e.arguments[0]) return unwrapSpread(e.arguments[0]);

    if (e.type === 'CallExpression' && expression.type === 'Identifier' && expression.name === 'html' && e.arguments[0]) {
        return unwrapSpread(e.arguments[0]);
    }

    return;
}

function isSafeCall(object: Expression | SpreadElement): boolean {
    return getSafeCallArg(object) !== undefined;
}

function getSafeCallArg(e: Expression | SpreadElement): Expression | undefined {
    const expression = unwrapCallExpression(e);
    if (!expression) return;

    if (e.type === 'CallExpression' && expression.type === 'MemberExpression'
        && expression.object.type === 'Identifier' && expression.object.name === '_jsx'
        && expression.property.type === 'Identifier' && expression.property.name === 'safe'
        && e.arguments[0]) return unwrapSpread(e.arguments[0]);

    if (e.type === 'CallExpression' && expression.type === 'MemberExpression'
        && expression.object.type === 'Identifier'
        && expression.property.type === 'Identifier' && expression.property.name === 'safe'
        && e.arguments[0]) return unwrapSpread(e.arguments[0]);

    if (e.type === 'CallExpression' && expression.type === 'Identifier' && expression.name === 'safe' && e.arguments[0]) {
        return unwrapSpread(e.arguments[0]);
    }

    return;
}

function isChildren(e: Expression | SpreadElement): boolean {
    if (e.type === 'MemberExpression' && (e.object.type === 'Identifier' || e.object.type === 'ThisExpression')
        && e.property.type === 'Identifier' && e.property.name === 'children') return true;

    if (e.type === 'Identifier' && e.name === 'children') {
        return true;
    }

    return false;
}

function getSafeString(e: Expression | SpreadElement): Expression | undefined {
    if (e.type === 'ObjectExpression' && e.properties.length === 1 && e.properties[0].type === 'Property' && e.properties[0].key.type === 'MemberExpression'
        && e.properties[0].key.property.type === 'Identifier' && e.properties[0].key.property.name === 'safeString'
        && !isPattern(e.properties[0].value)
    ) {
        return e.properties[0].value;
    }
    return;
}

function toSafeString(jsxRuntime: string, e: Expression): ObjectExpression {
    return {
        type: 'ObjectExpression',
        properties: [
            {
                type: 'Property',
                key: {
                    type: 'MemberExpression',
                    object: { type: 'Identifier', name: jsxRuntime },
                    computed: false,
                    property: { type: 'Identifier', name: 'safeString' }
                } as MemberExpression,
                value: e,
                kind: 'init',
                computed: true,
                method: false,
                shorthand: false
            }
        ]
    };
}

function isEscapeCall(e: Expression | SpreadElement): boolean {
    const expression = unwrapCallExpression(e);
    if (!expression) return false;

    return e.type === 'CallExpression' && expression.type === 'MemberExpression'
        && expression.object.type === 'Identifier'
        && expression.property.type === 'Identifier'
        && (expression.property.name === 'escape' || expression.property.name === 'escapeAttribute')
        ;
}

export function isOptimisedHtmlString(e: Expression | SpreadElement): boolean {
    //utils_1.escape(page).htmlString
    //or (0, utils_1.escape)(page).htmlString
    if (e.type !== 'MemberExpression') return false;
    const expression = unwrapCallExpression(e.object);
    if (!expression) return false;

    return expression.type === 'MemberExpression'
        && expression.property.type === 'Identifier' && expression.property.name === 'escape'
        && e.property.type === 'Identifier' && e.property.name === 'htmlString';
}

function isUserEscapeCall(e: Expression | SpreadElement): boolean {
    const expression = unwrapCallExpression(e);
    if (!expression) return false;

    if (e.type === 'CallExpression' && expression.type === 'MemberExpression'
        && expression.object.type === 'Identifier'
        && expression.property.type === 'Identifier'
        && (expression.property.name === 'escape')) {
        return true;
    }

    return e.type === 'CallExpression' && expression.type === 'Identifier' && expression.name === 'escape' && e.arguments[0] !== undefined;
}

function extractChildrenFromObjectExpressionProperties(props: Array<Property | SpreadElement>): Expression | undefined {
    for (let i = 0; i < props.length; i++) {
        const prop = props[i];
        if (prop.type === 'Property' && prop.key.type === 'Identifier' && prop.key.name === 'children') {
            props.splice(i, 1);
            return prop.value as Expression;
        }
    }
    return;
}

type ConcatableType = Expression | Identifier;

type OptimisedBinaryExpression = BinaryExpression & { _optimised?: boolean };
type OptimisedArrayExpression = ArrayExpression & { _optimised?: boolean };

function isOptimisedArrayExpression(e: Expression): e is OptimisedArrayExpression {
    return e.type === 'ArrayExpression' && (e as any)._optimised === true;
}

function isOptimisedBinaryExpression(e: Expression): e is OptimisedBinaryExpression {
    return e.type === 'BinaryExpression' && (e as any)._optimised === true;
}

function extractBinaryExpressions(e: BinaryExpression, expressions?: Expression[]): Expression[] {
    expressions ||= [];

    if (e.left.type === 'BinaryExpression') {
        extractBinaryExpressions(e.left, expressions);
    } else {
        expressions.push(e.left);
    }

    if (e.right.type === 'BinaryExpression') {
        extractBinaryExpressions(e.right, expressions);
    } else {
        expressions.push(e.right);
    }

    return expressions;
}

/**
 * We convert .jsx/.jsxs back to createElement syntax to have one optimization syntax.
 * createElement is used by TSX as well as fallback when `<div {...props} something=123>` is used.
 *
 *
 * _jsx("div", { id: "123" }, void 0)
 * -> _jsx.createElement("div", {id: "123"}}
 *
 * _jsx("div", { children: "Test" }, void 0)
 * -> _jsx.createElement("div", {}, "Test")
 *
 * _jsx("div", Object.assign({ id: "123" }, { children: "Test" }), void 0)
 * -> _jsx.createElement("div", {id: "123"}, "Test"}
 *
 * _jsx("div", Object.assign({ id: "123" }, { children: _jsx('b", { children: "strong' }, void 0) }), void 0);
 * -> _jsx.createElement("div", {id: "123"}, _jsx.createElement("b", {}, "strong"))
 */
function convertNodeToCreateElement(node: Expression): Expression {
    if (node.type !== 'CallExpression') return node;
    let isCJS = isCjsJSXCall(node);
    const isAvoidedCJS = isAvoidedThisCjsJSXCall(node);
    const isESM = isESMJSXCall(node);

    if (!isCJS && !isESM && !isAvoidedCJS) return node;

    if (isESM) {
        //rewrite to _jsx.createElement
        node.callee = {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: '_jsx' },
            computed: false,
            property: { type: 'Identifier', name: 'createElement' }
        } as MemberExpression;
    } else if (isAvoidedCJS) {
        //convert (0, x)() to x()
        if (node.type === 'CallExpression' && node.callee.type === 'SequenceExpression') {
            const expression = node.callee.expressions[1];
            node.callee = expression;
            isCJS = true;
        }
    }

    if (isCJS) {
        if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
            node.callee.property.name = 'createElement';
        }
    }

    node.arguments.splice(2); //remove void 0

    if (!node.arguments[1]) return node;

    if (node.arguments[1].type === 'CallExpression' && node.arguments[1].callee.type === 'MemberExpression' && node.arguments[1].callee.object.type === 'Identifier' && node.arguments[1].callee.object.name === 'Object') {
        //Object.assign(), means we have 2 entries, one with attributes, and second with `children`
        // Object.assign({id: 123}, {children: "Test"}) or
        // Object.assign({}, props, { id: "123" }, { children: "Test" })
        const objectAssignsArgs = node.arguments[1].arguments;
        const lastArgument = objectAssignsArgs[objectAssignsArgs.length - 1];

        if (lastArgument.type !== 'ObjectExpression') throw new Error(`Expect ObjectExpression, got ${JSON.stringify(lastArgument)}`);

        const children = extractChildrenFromObjectExpressionProperties(lastArgument.properties);
        if (children) {
            if (children.type === 'ArrayExpression') {
                node.arguments.push(...children.elements.map(v => convertNodeToCreateElement(v as Expression)));
            } else {
                node.arguments.push(convertNodeToCreateElement(children));
            }
        }

        if (objectAssignsArgs.length > 2) {
            //remove last
            objectAssignsArgs.splice(objectAssignsArgs.length - 1, 1);
        } else {
            if (objectAssignsArgs[0].type === 'ObjectExpression') {
                node.arguments[1] = { type: 'ObjectExpression', properties: objectAssignsArgs[0].properties };
            }
        }
    } else if (node.arguments[1].type === 'ObjectExpression') {
        //simple {}
        const children = extractChildrenFromObjectExpressionProperties(node.arguments[1].properties);

        if (children) {
            if (children.type === 'ArrayExpression') {
                node.arguments.push(...children.elements.map(v => convertNodeToCreateElement(v as Expression)));
            } else {
                node.arguments.push(convertNodeToCreateElement(children));
            }
        }
    }

    return node;
}

export function optimizeJSX(code: string): string {
    const tree = parse(code);

    replace(tree, (node: any) => {
        if (isESMJSXCall(node) || isCjsJSXCall(node) || isAvoidedThisCjsJSXCall(node)) {
            return optimizeNode(convertNodeToCreateElement(node), true);
        }
        return node;
    });

    return generate(tree);
}

export function convertJsxCodeToCreateElement(code: string): string {
    const tree = parse(code);

    replace(tree, (node: any) => {
        if (isESMJSXCall(node) || isCjsJSXCall(node) || isAvoidedThisCjsJSXCall(node)) {
            return convertNodeToCreateElement(node);
        }
        return node;
    });

    return generate(tree);
}
