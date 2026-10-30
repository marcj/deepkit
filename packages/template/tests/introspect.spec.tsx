import { expect, test } from '@jest/globals';
import '../src/optimize-tsx';
import { isOptimisedHtmlString, optimizeJSX, parseCode } from '../src/optimize-tsx.js';

Error.stackTraceLimit = 200;

function getExpression(code: string): any {
    const node = parseCode(code);
    return node.body[0].expression;
}

test('test check functions', () => {
    expect(isOptimisedHtmlString(getExpression(`utils_1.escape(page).htmlString`))).toBe(true);
    expect(isOptimisedHtmlString(getExpression(`(0, utils_1.escape)(page).htmlString`))).toBe(true);
    expect(isOptimisedHtmlString(getExpression(`(0, utils_1.nope)(page).htmlString`))).toBe(false);
});

test('template test', async () => {
    // console.dir(parseCode(`utils_1.escape(page).htmlString`), { depth: null });
    // console.dir(parseCode(`(0, utils_1.escape)(page).htmlString`), { depth: null });
    // console.dir(parseCode(`jsx_runtime_1.jsx()`), { depth: null });
    // console.dir(parseCode(`(0, jsx_runtime_1.jsx)()`), { depth: null });
    // console.dir(parseCode(`'a' + props.children + 'b'`), { depth: null });
    // console.dir(parseCode(`'a' + this.children + 'b'`), { depth: null });
    // console.dir(parseCode(`jsx.safe('a')`), { depth: null });
    // console.dir(parseCode(`['a', 'b']`), { depth: null });
    // console.dir(parseCode(`const a = { '\x00s': 'a' }`), { depth: null });
    // console.dir(parseCode(`const a = { [jsx.safeString]: 'a' }`), { depth: null });
    // console.dir(parseCode(`const a = escape(e)`), { depth: null });
    // console.dir(parseCode(`const a = escape(e).safeHtml`), { depth: null });

    // console.dir(parseCode(`'a' + children + 'b'`), { depth: null });
    // console.dir(parseCode(`const a = {a: b}`), { depth: null });
    // console.dir(generateCode({ type: 'Identifier', name: 'assd'}), { depth: null });
    // console.dir(generateCode({ type: 'ArrayPattern', elements: [{ type: 'Identifier', name: 'a'}, { type: 'Identifier', name: 'b'}]}), { depth: null });
    // console.dir(parseCode(`html('asd')`), { depth: null });
    // console.dir(parseCode(`html(\`asd\`)`), { depth: null });
    // console.dir(parseCode(`html(\`asd \${3} \`)`), { depth: null });
    // console.dir(parseCode(`variable + '23' + 23;`), { depth: null });
    // console.log(test1.toString());
    // console.log(JSON.stringify(tree.parse('_jsx.createElement("div", {}, void 0)')));
});

test('optimizeJSX visits all node types', () => {
    // class static blocks are not known to every AST walker
    const code = `class View { static { this.x = 1; } render() { return jsx_runtime_1.jsx("div", { id: "a", children: "Hello" }); } }`;
    expect(optimizeJSX(code)).toBe(
        'class View {\n  static {\n    this.x = 1;\n  }\n  render() {\n    return {\n      render: undefined,\n      attributes: undefined,\n      childrenEscaped: "<div id=\\"a\\">Hello</div>"\n    };\n  }\n}\n',
    );
});
