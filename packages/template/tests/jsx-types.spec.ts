import { expect, test } from '@jest/globals';
import ts from 'typescript';
import { join } from 'path';

test('published jsx-runtime provides the JSX types', () => {
    // jsx-runtime.ts referenced the global JSX types via /// <reference path="./src/elements.d.ts" />, which tsc drops
    // from the emitted .d.ts. With moduleResolution nodenext or bundler (resolving the package exports to dist),
    // every element was an error: no interface 'JSX.IntrinsicElements' exists.
    const program = ts.createProgram([join(__dirname, 'fixtures/jsx-types/app.tsx')], {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        types: [],
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: '@deepkit/template',
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    const errors = ts.getPreEmitDiagnostics(program).map(v => ts.flattenDiagnosticMessageText(v.messageText, '\n'));
    expect(errors).toEqual([]);
});
