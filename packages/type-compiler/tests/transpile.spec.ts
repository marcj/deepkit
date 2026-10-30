import { expect, jest, test } from '@jest/globals';
import { transpile, transpileAndRun } from './utils.js';
import * as ts from 'typescript';

test('function __type', () => {
    const res = transpile({ app: `function log(message: string) {}` });
    console.log(res);
    expect(res.app).toContain('log.__type = ');
});

test('resolve import ts', () => {
    const res = transpile({
        'app': `
            import { Logger } from './logger';
            function fn(logger: Logger) {}
        `,
        'logger': `export class Logger {}`
    });

    console.log(res);
    expect(res.app).toContain('() => logger_1.Logger');
    expect(res.logger).toContain('Logger.__type =');
});

test('use global types with esnext target', () => {
    const res = transpile({
        'app': `
            interface User {}
            export type a = Partial<User>;
        `
    }, {
        target: ts.ScriptTarget.ESNext,
    });

    expect(res.app).toContain('const __ΩPartial = ');
    expect(res.app).toContain('() => __ΩPartial');
});

test('resolve import d.ts', () => {
    const res = transpile({
        'app': `
            import { Logger } from './logger';
            function fn(logger: Logger) {}
        `,
        'logger.d.ts': `export declare class Logger {}`
    });

    console.log(res);
    expect(res.app).toContain('() => logger_1.Logger');
});

test('resolve import node_modules', () => {
    const res = transpile({
        'app': `
            import { Logger } from 'logger';
            function fn(logger: Logger) {}
        `,
        'node_modules/logger/index.d.ts': `export declare class Logger {}`
    });

    console.log(res);
    expect(res.app).toContain('() => logger_1.Logger');
});

test('pass type argument named function', () => {
    const res = transpile({
        'app': `
            function getType<T>(type?: ReceiveType<T>) {
            }

            getType<string>();
        `
    });

    console.log(res);
});

test('pass type argument named function second param', () => {
    const res = transpile({
        'app': `
            type ReceiveType<T> = Packed | Type | ClassType<T>;

            function getType<T>(first: string = 1, type?: ReceiveType<T>) {
            }

            getType<string>();
        `
    });

    console.log(res);
});

test('pass type argument property access', () => {
    const res = transpile({
        'app': `
            class Database {
                query<T>(type?: ReceiveType<T>) {}
            }

            const db = new Database;
            db.query<string>();
        `
    });

    console.log(res);
});

test('pass type argument arrow function', () => {
    const res = transpile({
        'app': `
            (<T>(type?: ReceiveType<T>) => {})<string>();
        `
    });

    console.log(res);
});

test('globals', () => {
    const res = transpile({
        'app': `
            interface User {}
            export type a = Partial<User>;
        `
    });

    expect(res.app).toContain('const __ΩPartial = ');
    expect(res.app).toContain('() => __ΩPartial');
});

test('chained methods two calls', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            class Http {
                response<T>(type?: ReceiveType<T>) {
                    types.push(type);
                    return this;
                }
            }
            const http = new Http;
            http.response<1>().response<2>();
            types;
        `
    });

    console.log(res);
    expect(res).toEqual([[1, '.!'], [2, '.!']]);
});

test('chained methods two calls, one without', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            class Http {
                response<T>(type?: ReceiveType<T>) {
                    types.push(type);
                    return this;
                }
            }
            const http = new Http;
            http.response().response<2>();
            types;
        `
    });

    console.log(res);
    expect(res).toEqual([undefined, [2, '.!']]);
});

test('chained methods three calls', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            class Http {
                response<T>(type?: ReceiveType<T>) {
                    types.push(type);
                    return this;
                }
            }
            const http = new Http;
            http.response<1>().response<2>().response<3>();
            types;
        `
    });

    console.log(res);
    expect(res).toEqual([[1, '.!'], [2, '.!'], [3, '.!']]);
});

test('chained methods three calls one without', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            class Http {
                GET(path: string) { return this }
                response<T>(n: number, desc: string, type?: ReceiveType<T>) {
                    types.push(type);
                    return this;
                }
            }
            const http = new Http;
            http.GET('/action3')
                .response<2>(200, \`List\`)
                .response<3>(400, \`Error\`);

            types;
        `
    });

    console.log(res);
    expect(res).toEqual([[2, '.!'], [3, '.!']]);
});

test('multiple calls optional types', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            function add<T>(type?: ReceiveType<T>) {
                types.push(type);
            }
            add<1>();
            add();
            types;
        `
    });

    console.log(res);
    expect(res).toEqual([[1, '.!'], undefined]);
});

test('multiple deep calls optional types', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            function add<T>(type?: ReceiveType<T>) {
                types.push(type);
                add2();
            }
            function add2<T>(type?: ReceiveType<T>) {
                types.push(type);
            }
            add<1>();
            add();
            types;
        `
    });

    console.log(res);
    expect(res).toEqual([[1, '.!'], undefined, undefined, undefined]);
});

test('chained optional methods', () => {
    const res = transpileAndRun({
        'app': `
            const types: any[] = [];
            class Http {
                response<T>(type?: ReceiveType<T>) {
                    types.push(type);
                    return this;
                }
            }
            const http = new Http;
            http.response<1>().response();
            types;
        `
    });

    console.log(res);
    expect(res).toEqual([[1, '.!'], undefined]);
});

test('readonly constructor properties', () => {
    const res = transpileAndRun({
        'app': `
           class User {
              constructor(readonly id: number) {}
           }
        `
    });

    console.log(res);
});

test('readonly array', () => {
    const res = transpileAndRun({
        'app': `
            interface Post {
                id: number;
            }

            interface User {
                readonly id: number;
                readonly posts: readonly Post[]
            }
        `
    });

    console.log(res);
});

test('enum union', () => {
    const res = transpile({
        'app': `
            enum StatEnginePowerUnit {
                Hp,
            }

            enum StatWeightUnit {
                Lbs,
                Kg,
            }

            type StatMeasurementUnit = StatEnginePowerUnit | StatWeightUnit;
            typeOf<StatMeasurementUnit>()
        `
    });

    console.log(res);
});

test('class generic reflection', () => {
    const res = transpile({
        'app': `
            class A<T> {
                constructor(type?: ReceiveType<T>) {
                }
            }

            new A<string>();
        `
    });

    console.log(res);
});

test('class generic expression reflection', () => {
    const res = transpile({
        'app': `
            class A<T> {
                constructor(type?: ReceiveType<T>) {
                }
            }

            const a = {b: A};

            new a.b<string>();
        `
    });

    console.log(res);
});

test('class extends generic', () => {
    const res = transpile({
        'app': `
            class A<T> {
                constructor(type?: ReceiveType<T>) {
                }
            }

            class B extends A<string> {}
            new B();
        `
    });

    console.log(res);
});

test('es2021', () => {
    const res = transpile({
        'app': `
        interface User {
            id: number;
            name: string;
            password: string;
        }
        type ReadUser = Omit<User, 'password'>;
        const type = typeOf<ReadUser>();
        `
    }, {target: ts.ScriptTarget.ES2021});
    console.log(res);
    expect(res.app).toContain(`const __ΩPick = [`);
    expect(res.app).toContain(`const type = typeOf([], [() => __ΩReadUser, 'n!'])`);
});

test('es2022', () => {
    const res = transpile({
        'app': `
        interface User {
            id: number;
            name: string;
            password: string;
        }
        type ReadUser = Omit<User, 'password'>;
        const type = typeOf<ReadUser>();
        `
    }, {target: ts.ScriptTarget.ES2022});
    console.log(res);
    expect(res.app).toContain(`const __ΩPick = [`);
    expect(res.app).toContain(`const type = typeOf([], [() => __ΩReadUser, 'n!'])`)
});


test('Return function ref', () => {
    //see GitHub issue #354
    const res = transpile({
        'app': `
        function Option<T>(val: T): Option<T> {
        };
        `
    });
    console.log(res);
    expect(res.app).toContain(`() => Option,`);
});

test('Return arrow function ref', () => {
    //see GitHub issue #354
    const res = transpile({
        'app': `
        const Option = <T>(val: T): Option<T> => {
        };
        `
    });
    console.log(res);
    expect(res.app).toContain(`() => Option,`);
});

test('extends with reference to this', () => {
    const res = transpile({
        'app': `
        class Factory {
            create() {
                class LogEntityForSchema extends this.options.entity {
                }
            }
        }
        `
    });
    console.log(res);
    //currently broken as it returns LogEntityForSchema.options.entity, probably a bug in TS
    // expect(res.app).toContain(`() => this.options.entity,`);
});

test('keyof this expression', () => {
    const res = transpile({
        'app': `
        class Factory {
            someFunctionC(input: keyof this) { }
        }
        `
    });
    console.log(res);
});

test('keep "use x" at top', () => {
    const res = transpile({
        'app': `
        "use client";
        const a = (a: string) => {};
        `
    });
    // directives must stay above the injected helpers. TypeScript 6 emits "use strict" first (strict by default).
    expect(res.app.replace(/^"use strict";\n/, '').startsWith('"use client";')).toBe(true);
});

test('Function', () => {
    const res = transpile({
        'app': `
        type a = Function;
        `
    });
    expect(res.app).toContain(`[() => Function, `);
});

test('inline type definitions should compile', () => {
    const res = transpile({
        'app': `
        function testFn<
            T extends ClassType<any>,
            Prop extends keyof InstanceType<T>
        >(options: {
            type: T;
            props: Prop[];
        }) {
            type R = Pick<InstanceType<Schema>, Prop>;
        }
        `
    });
    console.log(res);
});

test('class typeName', () => {
    const res = transpile({
        'app': `
    class StreamApiResponseClass<T> {
        constructor(public response: T) {
        }
    }
    function StreamApiResponse<T>(responseBodyClass: ClassType<T>) {
        class A extends StreamApiResponseClass<T> {
            constructor(@t.type(responseBodyClass) public response: T) {
                super(response);
            }
        }

        return A;
    }
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`'StreamApiResponseClass'`);
});

test('resolve type ref', () => {
    const res = transpile({
        'app': `
    class Guest {}
    class Vehicle {
        constructor(public Guest: Guest) {
        }
    }
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`() => Guest, 'Guest'`);
});

test('resolve type ref2', () => {
    const res = transpile({
        'app': `
    class Guest {}
    class Vehicle {
        public Guest: Guest;
    }
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`() => Guest, 'Guest'`);
});

test('ReceiveType arrow function', () => {
    const res = transpile({
        'app': `
export const typeValidation = <T>(type?: ReceiveType<T>): ValidatorFn => (control: AbstractControl) => {
        type = resolveReceiveType(type);
        const errors = validate<T>(control.value)
        console.log(errors)
        return errors.length ? {validation: errors[0]} : null
}
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`exports.typeValidation.Ω = undefined; return __assignType((control) =>`);
});

test('ReceiveType forward to type passing', () => {
    const res = transpile({
        'app': `
        function typeOf2<T>(type?: ReceiveType<T>) {
            return resolveReceiveType(type);
        }

        function mySerialize<T>(type?: ReceiveType<T>) {
            return typeOf2<T>();
        }
        `
    });
    console.log(res.app);
});

test('symbol function name', () => {
    const res = transpile({
        'app': `
        const a = Symbol('a');
        class MySet {
            [a](): any {}
            [Symbol.iterator](): any {}
        }
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`() => Symbol.iterator`);
});

test('infer type', () => {
    const res = transpile({
        'app': `
        class A {
            a = 1;
        }
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`'a'`);
});

test('intrinsic type', () => {
    const res = transpile({
        'app': `
        export type A = Capitalize<'a'>;
        `
    });
    console.log(res.app);
    expect(res.app).toContain(`const __ΩCapitalize = `);
});

test('forwardRef argument is not wrapped', () => {
    // Angular's partial compilation linker only accepts forwardRef(() => Type). With __assignType around the
    // arrow function, apps failed to link libraries built with reflection: "Unsupported `forwardRef(fn)` call".
    const res = transpile({
        'app': `
            declare function forwardRef<T>(fn: () => T): T;
            declare const i0: { forwardRef: typeof forwardRef };
            class A {}
            const ref = forwardRef((): typeof A => A);
            const ref2 = i0.forwardRef((): typeof A => A);
            const other = (): typeof A => A;
        `,
    });
    expect(res.app).toContain('ref = forwardRef(() => A)');
    expect(res.app).toContain('ref2 = i0.forwardRef(() => A)');
    expect(res.app).toContain('other = __assignType(() => A');
});

test('resolves types from .mts and .d.mts files', () => {
    // the resolver only accepted .ts, .tsx and .d.ts, so with moduleResolution bundler or nodenext a class from a
    // package shipping .d.mts types (e.g. openai) was reflected as never: "Undefined dependency openAi: never"
    const res = transpile({
        'app': `
            import { Service } from './lib.mjs';
            export class Controller {
                constructor(public service: Service) {}
            }
        `,
        'lib.mts': `export class Service {}`,
    }, {
        module: ts.ModuleKind.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    expect(res.app).toContain('() => Service');
});

test('declare statements', () => {
    // ambient declarations have no runtime implementation, so they get no type (#601)
    const res = transpile({
        'app': `
            function getEnv() { return { MODE: 'production' }; }
            type ENV = ReturnType<typeof getEnv>;
            declare global {
                var ENV: ENV;
                interface Window {
                    ENV: ENV;
                }
            }
            declare function external(x: number): string;
            export declare interface Declared { id: number }
        `
    });
    expect(res.app).toContain('const __ΩENV = ');
    expect(res.app).not.toContain('__ΩWindow');
    expect(res.app).not.toContain('__ΩDeclared');
    // would throw a ReferenceError
    expect(res.app).not.toContain('external.__type');
});

test('pass type parameter to another function', () => {
    // with TypeScript's debug assertions enabled, replacing only the identifier inside the type reference `T`
    // failed with "Node InferType did not pass test 'isEntityName'" (#509).
    // The assertion level can not be changed reliably once TypeScript was used, so use fresh module instances.
    let res: Record<string, string> = {};
    jest.isolateModules(() => {
        require('typescript').Debug.setAssertionLevel(1);
        res = require('./utils.js').transpile({
            'app': `
                function a<T>(t: T): T {
                    return b<T>(t);
                }
                function b<T>(t: T): T {
                    return t;
                }
            `
        });
    });
    expect(res.app).toContain('b.Ω = [[() => t, ');
});

test('type alias of external type and value with the same name', () => {
    // like `Result` of oxide.ts, this produced the invalid output `const __ΩMyResult;` (#352)
    const res = transpile({
        'app': `
            import { Result } from './result';
            export type MyResult = Result<number, Error>;
        `,
        'result.d.ts': `
            declare class ResultType<T, E> { unwrap(): T; }
            export type Result<T, E> = ResultType<T, E>;
            export declare function Result<T, E>(fn: () => T): Result<T, E>;
            export declare namespace Result {}
        `,
    });
    expect(res.app).toContain('const __ΩMyResult = [');
});

test('module-level function __type is hoisted', () => {
    // function declarations are hoisted, so ReflectionFunction.from(fn) can be called before the declaration (#664)
    const res = transpile({
        'app': `
            run(greet);
            function greet(name: string) {
                function inner(a: number) {}
            }
        `
    });
    expect(res.app.indexOf('greet.__type = ')).toBeLessThan(res.app.indexOf('run(greet)'));
    expect(res.app.indexOf('inner.__type = ')).toBeGreaterThan(res.app.indexOf('function inner('));
});

test('optional chaining with type arguments', () => {
    // `a?.fn<T>()` was converted to the invalid assignment `a?.fn.Ω = ...`, or crashed TypeScript
    // when the chain continued after the call (#612)
    for (const target of [ts.ScriptTarget.ES2015, ts.ScriptTarget.ES2022]) {
        const res = transpileAndRun({
            'app': `
                const types: any[] = [];
                class Service {
                    fn<T>(type?: ReceiveType<T>) {
                        types.push(type);
                        return this;
                    }
                }
                function run(service?: Service) {
                    return [service?.fn<1>(), service?.fn<2>().fn<3>(), service?.fn<4>()?.fn<5>()];
                }
                [run(), run(new Service).map(v => v instanceof Service), types];
            `
        }, { target });
        expect(res).toEqual([[undefined, undefined, undefined], [true, true, true], [[1, '.!'], [2, '.!'], [3, '.!'], [4, '.!'], [5, '.!']]]);
    }
});
