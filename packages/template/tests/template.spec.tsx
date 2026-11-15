import { expect, test } from '@jest/globals';
import '../src/optimize-tsx';
import { html, render } from '../src/template.js';
import { Injector } from '@deepkit/injector';
import { simple1, simple2, simple3, simple4, simpleHtmlInjected, simpleHtmlInjectedValid } from './simple.js';
import { convertJsxCodeToCreateElement, optimizeJSX } from '../src/optimize-tsx.js';
import { escape, escapeAttribute, escapeHtml, safe } from '../src/utils.js';

Error.stackTraceLimit = 200;

test('template simple', async () => {
    expect(await render(Injector.from([]), <div></div>)).toBe('<div></div>');

    expect(await render(Injector.from([]), <div>Test</div>)).toBe('<div>Test</div>');
    expect(await render(Injector.from([]), <div id="12"></div>)).toBe(`<div id="12"></div>`);
    expect(await render(Injector.from([]), <div id="12">Test</div>)).toBe(`<div id="12">Test</div>`);

    expect(await render(Injector.from([]), <div><a href="google.de">Link</a></div>)).toBe('<div><a href="google.de">Link</a></div>');

    expect(await render(Injector.from([]), <div><b>Link2</b><strong>Link2</strong></div>)).toBe('<div><b>Link2</b><strong>Link2</strong></div>');
});

test('template injection', async () => {
    class Database {
        users: any[] = [{ username: 'Peter' }];
    }

    function Bla(props: {}, children: any, database: Database) {
        return <div>{database.users.length}</div>;
    }

    expect(await render(Injector.from([Database]), <Bla></Bla>)).toBe('<div>1</div>');
});

test('template html escape', async () => {
    expect(await render(Injector.from([]), <div>{'<strong>MyHTML</strong>'}</div>)).toBe('<div>&lt;strong&gt;MyHTML&lt;/strong&gt;</div>');

    const myVar = '<strong>MyHTML</strong>';
    expect(await render(Injector.from([]), <div>{myVar}</div>)).toBe('<div>&lt;strong&gt;MyHTML&lt;/strong&gt;</div>');

    expect(await render(Injector.from([]), <div>{html(myVar)}</div>)).toBe('<div><strong>MyHTML</strong></div>');

    expect(await render(Injector.from([]), <div id={myVar}></div>)).toBe('<div id="&lt;strong&gt;MyHTML&lt;/strong&gt;"></div>');
});

function normalize(string: string): string {
    return string.trim().replace(/\n\s*/g, '');
}

function optimiseFn(fn: Function): Function {
    const code = fn.toString();
    return eval('(' + optimizeJSX(code) + ')');
}

async function simpleRender(t: any): Promise<string> {
    return await render(Injector.from([]), t);
}

// function test1(props: {[name: string]: any} = {}) {
//     return <div {...props} id="123">Test</div>
// }


test('template jsx for esm convert to createElement', async () => {
    expect(normalize(convertJsxCodeToCreateElement(`_jsx("div", { id: "123" }, void 0);`))).toBe(
        `_jsx.createElement("div", {id: "123"});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`_jsx("div", { id: myId }, void 0);`))).toBe(
        `_jsx.createElement("div", {id: myId});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`_jsx("div", { id: "123", name: "Peter" }, void 0);`))).toBe(
        `_jsx.createElement("div", {id: "123",name: "Peter"});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`_jsx("div", { children: "Test" }, void 0);`))).toBe(
        `_jsx.createElement("div", {}, "Test");`
    );

    expect(normalize(convertJsxCodeToCreateElement(`_jsx("div", Object.assign({ id: "123" }, { children: "Test" }), void 0);`))).toBe(
        `_jsx.createElement("div", {id: "123"}, "Test");`
    );

    expect(normalize(convertJsxCodeToCreateElement(
        `_jsxs("div", Object.assign({ id: "123" }, { children: [_jsx("b", { children: "strong" }, void 0), _jsx("b", { children: "strong2" }, void 0)] }), void 0);`
    ))).toBe(
        `_jsx.createElement("div", {id: "123"}, _jsx.createElement("b", {}, "strong"), _jsx.createElement("b", {}, "strong2"));`
    );

    expect(normalize(convertJsxCodeToCreateElement(`_jsx(Website, { title: "Contact" }, void 0);`))).toBe(
        `_jsx.createElement(Website, {title: "Contact"});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`_jsx('div', {children: this.config.get('TEST') }, void 0);`))).toBe(
        `_jsx.createElement("div", {}, this.config.get("TEST"));`
    );
});

test('template jsx for esm optimize', async () => {
    expect(normalize(optimizeJSX(`_jsx("div", { id: "123" }, void 0);`))).toContain(
        `"<div id=\\"123\\"></div>"`
    );

    expect(normalize(optimizeJSX(`_jsx("div", { id: myId }, void 0);`))).toContain(
        `"<div id=\\\"" + _jsx.escapeAttribute(myId) + "\\\"></div>"`
    );

    expect(normalize(optimizeJSX(`_jsx("div", { id: "123", name: "Peter" }, void 0);`))).toContain(
        `"<div id=\\"123\\" name=\\"Peter\\"></div>"`
    );

    expect(normalize(optimizeJSX(`_jsx("div", { children: "Test" }, void 0);`))).toContain(
        `"<div>Test</div>"`
    );

    expect(normalize(optimizeJSX(`_jsx("div", Object.assign({ id: "123" }, { children: "Test" }), void 0);`))).toContain(
        `"<div id=\\"123\\">Test</div>"`
    );

    expect(normalize(optimizeJSX(`_jsx("div", Object.assign({}, props, { id: "123" }, { children: "Test" }), void 0);`))).toBe(
        `_jsx.createElement("div", Object.assign({}, props, {id: "123"}), "Test");`
    );

    expect(normalize(optimizeJSX(`_jsxs("div", Object.assign({ id: "123" }, { children: [_jsx("b", { children: "strong" }, void 0), _jsx("b", { children: "strong2" }, void 0)] }), void 0);`))).toContain(
        `"<div id=\\"123\\"><b>strong</b><b>strong2</b></div>"`
    );

    expect(normalize(optimizeJSX(`_jsx(Website, { title: "Contact" }, void 0);`))).toBe(
        `_jsx.createElement(Website, {title: "Contact"});`
    );

    expect(normalize(optimizeJSX(`_jsx(Website, { title: "Contact", children: _jsx("div", { id: "123" }, void 0)}, void 0);`))).toBe(
        `_jsx.createElement(Website, {title: "Contact"}, [{[_jsx.safeString]: "<div id=\\"123\\"></div>"}]);`
    );
});

test('template jsx for cjs convert to createElement', async () => {
    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx("div", { id: "123" }, void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {id: "123"});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx("div", { id: myId }, void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {id: myId});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx("div", { id: "123", name: "Peter" }, void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {id: "123",name: "Peter"});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx("div", { children: "Test" }, void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {}, "Test");`
    );

    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx("div", Object.assign({ id: "123" }, { children: "Test" }), void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {id: "123"}, "Test");`
    );

    expect(normalize(convertJsxCodeToCreateElement(
        `jsx_runtime_1.jsxs("div", Object.assign({ id: "123" }, { children: [jsx_runtime_1.jsx("b", { children: "strong" }, void 0), jsx_runtime_1.jsx("b", { children: "strong2" }, void 0)] }), void 0);`
    ))).toBe(
        `jsx_runtime_1.createElement("div", {id: "123"}, jsx_runtime_1.createElement("b", {}, "strong"), jsx_runtime_1.createElement("b", {}, "strong2"));`
    );

    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx(Website, { title: "Contact" }, void 0);`))).toBe(
        `jsx_runtime_1.createElement(Website, {title: "Contact"});`
    );

    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx('div', {children: this.config.get('TEST') }, void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {}, this.config.get("TEST"));`
    );

    //since v4.6 `void 0` is removed
    expect(normalize(convertJsxCodeToCreateElement(`jsx_runtime_1.jsx('div', {children: this.config.get('TEST') });`))).toBe(
        `jsx_runtime_1.createElement("div", {}, this.config.get("TEST"));`
    );

    //since v4.4 calls to exported functions have no `this` anymore, so (0, x)() is used.
    expect(normalize(convertJsxCodeToCreateElement(`(0, jsx_runtime_1.jsx)("div", {}, void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", {});`
    );

    // //since v4.4 calls to exported functions have no this anymore, so (0, x)() is used.
    expect(normalize(convertJsxCodeToCreateElement(`(0, jsx_runtime_1.jsx)("div", { children: (0, jsx_runtime_1.jsx)(Sub, {}, void 0) }, void 0)`))).toBe(
        `jsx_runtime_1.createElement("div", {}, jsx_runtime_1.createElement(Sub, {}));`
    );
});

test('template jsx for cjs optimize', async () => {
    <div id="123"></div>;
    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", { id: "123" }, void 0);`))).toContain(
        `"<div id=\\"123\\"></div>"`
    );

    <div><span>1</span><span>2</span></div>;
    expect(normalize(optimizeJSX(`jsx_runtime_1.jsxs("div", { children: [jsx_runtime_1.jsx("span", { children: "1" }, void 0), jsx_runtime_1.jsx("span", { children: "2" }, void 0)] }, void 0);`))).toContain(
        `"<div><span>1</span><span>2</span></div>"`
    );

    const hi = '123';
    <div>{hi}</div>;
    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", { children: hi }, void 0);`))).toContain(
        `[{[jsx_runtime_1.safeString]: "<div>"}, hi, {[jsx_runtime_1.safeString]: "</div>"}]`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", { id: myId }, void 0);`))).toContain(
        `"<div id=\\"" + jsx_runtime_1.escapeAttribute(myId) + "\\"></div>"`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", Object.assign({ id: "123" }, { children: hi }), void 0)`))).toContain(
        `[{[jsx_runtime_1.safeString]: "<div id=\\"123\\">"}, hi, {[jsx_runtime_1.safeString]: "</div>"}]`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", { id: "123", name: "Peter" }, void 0);`))).toContain(
        `"<div id=\\"123\\" name=\\"Peter\\"></div>"`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", { children: "Test" }, void 0);`))).toContain(
        `"<div>Test</div>"`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", Object.assign({ id: "123" }, { children: "Test" }), void 0);`))).toContain(
        `"<div id=\\"123\\">Test</div>"`
    );

    //for spread operator we have `props` in Object.assign
    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx("div", Object.assign({}, props, { id: "123" }, { children: "Test" }), void 0);`))).toBe(
        `jsx_runtime_1.createElement("div", Object.assign({}, props, {id: "123"}), "Test");`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsxs("div", Object.assign({ id: "123" }, { children: [jsx_runtime_1.jsx("b", { children: "strong" }, void 0), jsx_runtime_1.jsx("b", { children: "strong2" }, void 0)] }), void 0);`))).toContain(
        `"<div id=\\"123\\"><b>strong</b><b>strong2</b></div>"`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx(Website, { title: "Contact" }, void 0);`))).toBe(
        `jsx_runtime_1.createElement(Website, {title: "Contact"});`
    );

    expect(normalize(optimizeJSX(`jsx_runtime_1.jsx(Website, { title: "Contact", children: jsx_runtime_1.jsx("div", { id: "123" }, void 0)}, void 0);`))).toBe(
        `jsx_runtime_1.createElement(Website, {title: "Contact"}, [{[jsx_runtime_1.safeString]: "<div id=\\"123\\"></div>"}]);`
    );
});

test('template simple import', async () => {
    expect(await render(Injector.from([]), simple1())).toBe('<div id="123">Test</div>');
    expect(await render(Injector.from([]), simple2())).toBe('<div id="123"><b>strong</b></div>');
    expect(await render(Injector.from([]), simple3())).toBe('<div id="123"><b>strong</b><b>strong2</b></div>');
    expect(await render(Injector.from([]), simple4())).toBe('<div id="123" class="active"><div><b>strong</b><b>strong2</b></div></div>');
    expect(await render(Injector.from([]), simpleHtmlInjected())).toBe('<div>&lt;strong&gt;MyHTML&lt;/strong&gt;</div>');
    expect(await render(Injector.from([]), simpleHtmlInjectedValid())).toBe('<div><strong>MyHTML</strong></div>');
});

test('template render custom', async () => {
    expect(await render(Injector.from([]), { render: 'div', attributes: { id: '123' }, children: 'Test' })).toBe('<div id="123">Test</div>');
    expect(await render(Injector.from([]), { render: 'div', attributes: { id: '123' }, children: '<b>Test</b>' })).toBe('<div id="123">&lt;b&gt;Test&lt;/b&gt;</div>');
    expect(await render(Injector.from([]), { render: 'div', attributes: { id: '123' }, children: html('Test') })).toBe('<div id="123">Test</div>');
    expect(await render(Injector.from([]), { render: 'div', attributes: { id: '123' }, children: [html('Test')] })).toBe('<div id="123">Test</div>');
    expect(await render(Injector.from([]), { render: 'div', attributes: { id: '123' }, children: [html('<b>Test</b>')] })).toBe('<div id="123"><b>Test</b></div>');

    expect(await render(Injector.from([]), { render: 'div', attributes: { id: '123' }, children: ['Hi ', html('Test')] })).toBe('<div id="123">Hi Test</div>');
    expect(await render(Injector.from([]), { render: 'div', attributes: '', children: ['Hi ', html('Test')] })).toBe('<div>Hi Test</div>');

    expect(await render(Injector.from([]), {
        render: 'div',
        attributes: '',
        children: ['Hi ', { render: 'div', attributes: '', children: html('Test') }]
    })).toBe('<div>Hi <div>Test</div></div>');

});

test('html is still sanitized in compiled templates', async () => {
    function test1() {
        const content = '<span>unsafe</span>';
        return <div>{content}</div>;
    }

    function test2() {
        const content = '<span>unsafe</span>';
        return <div>{html(content)}</div>;
    }

    // console.log(test1.toString());
    // console.log(optimiseFn(test1).toString());
    // console.log(optimiseFn(test1)());
    expect(await simpleRender(test1())).toBe('<div>&lt;span&gt;unsafe&lt;/span&gt;</div>');
    expect(await simpleRender(optimiseFn(test1)())).toBe('<div>&lt;span&gt;unsafe&lt;/span&gt;</div>');

    expect(await simpleRender(test2())).toBe('<div><span>unsafe</span></div>');
    // console.log(test2.toString());
    // console.log(optimiseFn(test2).toString());
    // console.log(optimiseFn(test2)());
    expect(await simpleRender(optimiseFn(test2)())).toBe('<div><span>unsafe</span></div>');
});

test('attribute is still sanitized in compiled templates', async () => {
    function test1() {
        const content = `<span id="3">unsafe</span>`;
        return <div id={content}></div>;
    }

    const expected = '<div id="&lt;span id=&quot;3&quot;&gt;unsafe&lt;/span&gt;"></div>';
    expect(await simpleRender(test1())).toBe(expected);
    const o = optimiseFn(test1);
    expect(await simpleRender(o())).toBe(expected);
});

test('attribute quotes cannot break out (XSS)', async () => {
    function test1(title: string) {
        return <a title={title}>x</a>;
    }

    const payload = 'x" onmouseover="alert(1)';
    const expected = '<a title="x&quot; onmouseover=&quot;alert(1)">x</a>';
    expect(await simpleRender(test1(payload))).toBe(expected);
    expect(await simpleRender(optimiseFn(test1)(payload))).toBe(expected);

    const single = `x' onmouseover='alert(1)`;
    const expectedSingle = '<a title="x&#39; onmouseover=&#39;alert(1)">x</a>';
    expect(await simpleRender(test1(single))).toBe(expectedSingle);
    expect(await simpleRender(optimiseFn(test1)(single))).toBe(expectedSingle);

    expect(await render(Injector.from([]), { render: 'a', attributes: { title: payload }, children: 'x' } as any)).toBe(expected);
});

test('attribute escapes ampersand and angle brackets', async () => {
    function test1(href: string) {
        return <a href={href}>x</a>;
    }

    const expected = '<a href="/?a=1&amp;b=&lt;2&gt;">x</a>';
    expect(await simpleRender(test1('/?a=1&b=<2>'))).toBe(expected);
    expect(await simpleRender(optimiseFn(test1)('/?a=1&b=<2>'))).toBe(expected);
});

test('static attribute literals are escaped', async () => {
    function test1() {
        return <a title='say "hi" & bye'>x</a>;
    }

    const expected = '<a title="say &quot;hi&quot; &amp; bye">x</a>';
    expect(await simpleRender(test1())).toBe(expected);
    expect(await simpleRender(optimiseFn(test1)())).toBe(expected);
});

test('text escapes ampersand', async () => {
    function test1(val: string) {
        return <div>{val}</div>;
    }

    const expected = '<div>Tom &amp; Jerry &lt;3 &amp;amp; "quoted" \'single\'</div>';
    const input = `Tom & Jerry <3 &amp; "quoted" 'single'`;
    expect(await simpleRender(test1(input))).toBe(expected);
    expect(await simpleRender(optimiseFn(test1)(input))).toBe(expected);

    function test2() {
        return <div>{'a & b'}</div>;
    }

    expect(await simpleRender(test2())).toBe('<div>a &amp; b</div>');
    expect(await simpleRender(optimiseFn(test2)())).toBe('<div>a &amp; b</div>');
});

test('safe and html values bypass escaping', async () => {
    function test1(val: string) {
        return <div title={html(val)}>{html(val)}</div>;
    }

    const raw = '<b class="x">&amp;</b>';
    const expected = '<div title="<b class="x">&amp;</b>"><b class="x">&amp;</b></div>';
    expect(await simpleRender(test1(raw))).toBe(expected);
    expect(await simpleRender(optimiseFn(test1)(raw))).toBe(expected);

    function test2(val: string) {
        return <div>{safe(val)}</div>;
    }

    expect(await simpleRender(test2(raw))).toBe('<div><b class="x">&amp;</b></div>');
    expect(await simpleRender(optimiseFn(test2)(raw))).toBe('<div><b class="x">&amp;</b></div>');

    function test3() {
        return <div>{html('')}</div>;
    }

    expect(await simpleRender(test3())).toBe('<div></div>');
});

test('numbers are rendered in text and attributes', async () => {
    function test1(n: number) {
        return <div data-n={n} tabIndex={3}>{n}</div>;
    }

    const expected = '<div data-n="42" tabIndex="3">42</div>';
    expect(await simpleRender(test1(42))).toBe(expected);
    expect(await simpleRender(optimiseFn(test1)(42))).toBe(expected);
});

test('escape utilities', () => {
    const plain = 'nothing to escape here';
    expect(escapeHtml(plain)).toBe(plain);
    expect(escapeAttribute(plain)).toBe(plain);
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;"\'');
    expect(escapeAttribute('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtml(5)).toBe('5');
    expect(escapeAttribute(5)).toBe('5');
    expect(escape('<a title="x">').htmlString).toBe('&lt;a title=&quot;x&quot;&gt;');
});

test('literals are escaped', async () => {
    function test1() {
        return <div>{'<h1>'}</div>;
    }

    expect(await simpleRender(test1())).toBe('<div>&lt;h1&gt;</div>');
    expect(await simpleRender(optimiseFn(test1)())).toBe('<div>&lt;h1&gt;</div>');
});

test('class components props', async () => {
    class Title {
        constructor(protected props: { title: string }) {}
        async render() {
            return <h1>{this.props.title}</h1>;
        }
    }

    function test1() {
        return <Title title="Test" />;
    }

    expect(await simpleRender(test1())).toBe('<h1>Test</h1>');
});

test('functional components props', async () => {
    async function Title(props: { title: string }) {
        return <h1>{props.title}</h1>;
    }

    function test1() {
        return <Title title="Test" />;
    }

    expect(await simpleRender(test1())).toBe('<h1>Test</h1>');
});

test('Vars are escaped', async () => {
    function test1(val: string) {
        return <div>{val}</div>;
    }

    expect(await simpleRender(test1('<h1>'))).toBe('<div>&lt;h1&gt;</div>');
    expect(await simpleRender(optimiseFn(test1)('<h1>'))).toBe('<div>&lt;h1&gt;</div>');
});

test('sub call be unwrapped', async () => {
    function Sub() {
        return <div></div>;
    }

    function Comp(props: { children?: any }) {
        return <div><Sub/></div>;
    }

    console.log(Comp.toString());
    expect(optimizeJSX(Comp.toString())).toContain(
        `[{
      [jsx_runtime_1.safeString]: "<div>"
    }, jsx_runtime_1.createElement(Sub, {}), {
      [jsx_runtime_1.safeString]: "</div>"
    }]`
    );
});

test('children will be unwrapped', async () => {
    function Comp(props: { children?: any }) {
        return <html>
        <div>{props.children}</div>
        </html>;
    }

    console.log(optimizeJSX(Comp.toString()));
    expect(optimizeJSX(Comp.toString())).toContain(
        `[{
      [jsx_runtime_1.safeString]: "<html><div>"
    }, props.children, {
      [jsx_runtime_1.safeString]: "</div></html>"
    }]`
    );
});

test('component children will be unwrapped', async () => {
    class Comp {
        constructor(protected children: any) {
        }

        render() {
            return <html>
            <div>{this.children}</div>
            </html>;
        }
    }

    console.log(optimizeJSX(Comp.toString()));
    expect(optimizeJSX(Comp.toString())).toContain(
        `[{
        [jsx_runtime_1.safeString]: "<html><div>"
      }, this.children, {
        [jsx_runtime_1.safeString]: "</div></html>"
      }]`
    );
});
