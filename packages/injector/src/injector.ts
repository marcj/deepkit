import { isClassProvider, isExistingProvider, isFactoryProvider, isValueProvider, NormalizedProvider, ProviderWithScope, Tag, TagProvider, TagRegistry, Token } from './provider.js';
import { AbstractClassType, ClassType, CompilerContext, CustomError, getClassName, getPathValue, isArray, isClass, isFunction, isPrototypeOfBase } from '@deepkit/core';
import { ConfigurationProviderRegistry, ConfigureProviderEntry, findModuleForConfig, getScope, InjectorModule, PreparedProvider } from './module.js';
import { isOptional, isWithAnnotations, Packed, ReceiveType, reflect, ReflectionClass, ReflectionFunction, ReflectionKind, resolveReceiveType, stringifyType, Type, typeAnnotation } from '@deepkit/type';

export class InjectorError extends CustomError {

}

export class CircularDependencyError extends InjectorError {
}

export class ServiceNotFoundError extends InjectorError {
}

export class DependenciesUnmetError extends InjectorError {
}

export function tokenLabel(token: Token): string {
    if (token === null) return 'null';
    if (token === undefined) return 'undefined';
    if (token instanceof TagProvider) return 'Tag(' + getClassName(token.provider.provide) + ')';
    if (typeof token === 'symbol') return token.toString();
    if (typeof token === 'string' || typeof token === 'number' || typeof token === 'boolean' || typeof token === 'bigint') return token + '';
    if (isClass(token)) return getClassName(token);
    if (isType(token)) return stringifyType(token).replace(/\n/gm, '');
    if (isFunction(token)) return token.name;

    return token + '';
}

function functionParameterNotFound(ofName: string, name: string, position: number, token: any) {
    const argsCheck: string[] = [];
    for (let i = 0; i < position; i++) argsCheck.push('✓');
    argsCheck.push('?');

    throw new DependenciesUnmetError(
        `Unknown function argument '${name}: ${tokenLabel(token)}' of ${ofName}(${argsCheck.join(', ')}). Make sure '${tokenLabel(token)}' is provided.`,
    );
}

function constructorParameterNotFound(ofName: string, name: string, position: number, token: any) {
    const argsCheck: string[] = [];
    for (let i = 0; i < position; i++) argsCheck.push('✓');
    argsCheck.push('?');

    throw new DependenciesUnmetError(
        `Constructor argument '${name}: ${tokenLabel(token)}' of ${ofName}(${argsCheck.join(', ')}) is known but has no value. Make sure '${tokenLabel(token)}' is set.`,
    );
}

function knownServiceNotFoundError(label: string, scopes: string[], scope?: Scope) {
    throw new ServiceNotFoundError(
        `Service '${label}' is known but has no value.${scopes.length ? ` Available in scopes: ${scopes.join(', ')}, requested scope is ${scope ? scope.name : 'global'}.` : ''}`,
    );
}

function serviceNotFoundError(label: string) {
    throw new ServiceNotFoundError(
        `Service '${label}' not found. No matching provider.`,
    );
}

function knownServiceNotFoundInScope(label: string, scopes: string[], scope?: Scope) {
    throw new ServiceNotFoundError(
        `Service '${label}' is known but is not available in scope ${scope?.name || 'global'}. Available in scopes: ${scopes.join(', ')}.`,
    );
}

function factoryDependencyNotFound(ofName: string, name: string, position: number, token: any) {
    const argsCheck: string[] = [];
    for (let i = 0; i < position; i++) argsCheck.push('✓');
    argsCheck.push('?');

    throw new DependenciesUnmetError(
        `Unknown factory dependency argument '${tokenLabel(token)}' of ${ofName}(${argsCheck.join(', ')}). Make sure '${tokenLabel(token)}' is provided.`,
    );
}

function propertyParameterNotFound(ofName: string, name: string, position: number, token: any) {
    throw new DependenciesUnmetError(
        `Unknown property parameter ${name} of ${ofName}. Make sure '${tokenLabel(token)}' is provided.`,
    );
}

function transientInjectionTargetUnavailable(ofName: string, name: string, position: number, token: any) {
    throw new DependenciesUnmetError(
        `${TransientInjectionTarget.name} is not available for ${name} of ${ofName}. ${TransientInjectionTarget.name} is only available when injecting into other providers`,
    );
}

type Destination = { token: Token; };

function createTransientInjectionTarget(destination: Destination | undefined) {
    if (!destination) {
        return undefined;
    }

    return new TransientInjectionTarget(destination.token);
}

interface StackEntry {
    label: string,
    creation: number;
    id: number;
    cause: boolean;
}

function stackToPath(stack: StackEntry[]): string[] {
    const cause = stack.find(v => v.cause);
    stack.sort((a, b) => a.id - b.id);
    const labels = stack.map(v => v.label);
    if (cause) labels.push(cause.label);
    return labels;
}

function throwCircularDependency(paths: string[]) {
    const path = paths.join(' -> ');
    throw new CircularDependencyError(`Circular dependency found ${path}`);
}

export interface Scope {
    name: string;
}

export type ResolveToken<T> = T extends ClassType<infer R> ? R : T extends AbstractClassType<infer R> ? R : T;

export function resolveToken(provider: ProviderWithScope): Token {
    if (isClass(provider)) return provider;
    if (provider instanceof TagProvider) return resolveToken(provider.provider);

    return provider.provide;
}

/** @reflection never */
export type ContainerToken = symbol | number | bigint | boolean | string | AbstractClassType<unknown> | Function;

export function getContainerTokenFromType(type: Type): ContainerToken {
    if (type.id) return type.id;
    if (type.kind === ReflectionKind.literal) {
        if (type.literal instanceof RegExp) return type.literal.toString();
        return type.literal;
    }
    if (type.kind === ReflectionKind.class) return type.classType;
    if (type.kind === ReflectionKind.function && type.function) return type.function;
    return 'unknown';
}

export function isType(obj: any): obj is Type {
    return obj && typeof obj === 'object' && typeof (obj as any).kind === 'number';
}

function isPacked(obj: any): obj is Packed {
    return obj && typeof obj === 'object' && typeof (obj as any).length === 'number';
}

/**
 * Returns a value that can be compared with `===` to check if two tokens are actually equal even though
 * they are the result of different type expressions.
 *
 * This is used in the big switch-case statement in the generated code to match DI tokens.
 */
export function getContainerToken(type: Token): ContainerToken {
    if (type instanceof TagProvider) return getContainerToken(type.provider.provide);

    if (isType(type)) {
        return getContainerTokenFromType(type);
    }

    return type as ContainerToken;
}

/**
 * Returns the injector token type if the given type was decorated with `Inject<T>`.
 */
export function getInjectOptions(type: Type): Type | undefined {
    const annotations = typeAnnotation.getType(type, 'inject');
    if (!annotations) return;
    const t = annotations;
    return t && t.kind !== ReflectionKind.never ? t : type;
}

function getPickArguments(type: Type): Type[] | undefined {
    if (type.typeName === 'Pick' && type.typeArguments && type.typeArguments.length === 2) {
        return type.typeArguments;
    }
    if (!type.originTypes) return;

    for (const origin of type.originTypes) {
        if (origin.typeName === 'Pick' && origin.typeArguments && origin.typeArguments.length === 2) {
            return origin.typeArguments;
        }
    }

    return;
}

/**
 * Class describing where a transient provider will be injected.
 *
 * @reflection never
 */
export class TransientInjectionTarget {
    constructor(
        public readonly token: Token,
    ) {
    }
}

function* forEachDependency(provider: NormalizedProvider): Generator<{ type: Type, optional: boolean }> {
    if (isValueProvider(provider)) {
    } else if (isClassProvider(provider)) {
        let useClass = provider.useClass;
        if (!useClass) {
            if (isClass(provider.provide)) useClass = provider.provide as ClassType;
            if (isType(provider.provide) && provider.provide.kind === ReflectionKind.class) useClass = provider.provide.classType;
            if (!useClass) {
                throw new Error(`UseClassProvider needs to set either 'useClass' or 'provide' as a ClassType. Got ${provider.provide as any}`);
            }
        }

        const reflectionClass = ReflectionClass.from(useClass);

        const constructor = reflectionClass.getMethodOrUndefined('constructor');
        const constructorProperties: string[] = [];
        if (constructor) {
            for (const parameter of constructor.getParameters()) {
                if (parameter.getVisibility() !== undefined) constructorProperties.push(parameter.name);
                const tokenType = getInjectOptions(parameter.getType() as Type);
                const type = tokenType || parameter.getType() as Type;
                yield { type, optional: !parameter.isValueRequired() };
            }
        }

        for (const property of reflectionClass.getProperties()) {
            if (constructorProperties.includes(property.name)) continue;
            const tokenType = getInjectOptions(property.type);
            if (!tokenType) continue;
            yield { type: tokenType, optional: !property.isValueRequired() };
        }
    } else if (isExistingProvider(provider)) {
        for (const item of forEachDependency({ provide: provider.useExisting })) {
            yield item;
        }
    } else if (isFactoryProvider(provider)) {
        const reflection = ReflectionFunction.from(provider.useFactory);
        for (const parameter of reflection.getParameters()) {
            const tokenType = getInjectOptions(parameter.getType() as Type);
            const type = tokenType || parameter.getType() as Type;
            yield { type, optional: !parameter.isValueRequired() };
        }
    }
}

function isTransientInjectionTargetProvider(prepared: PreparedProvider): boolean {
    for (const provider of prepared.providers) {
        if (!provider.transient) continue;
        for (const { type } of forEachDependency(provider)) {
            if (type.kind === ReflectionKind.class && type.classType === TransientInjectionTarget) {
                return true;
            }
        }
    }
    return false;
}

/**
 * A factory function for some class.
 * All properties that are not provided will be resolved using the injector that was used to create the factory.
 */
export type PartialFactory<C> = (args: Partial<{ [K in keyof C]: C[K] }>) => C;

interface BuiltInjector {
    set(token: Token, value: any, scope?: Scope): void;

    get(token: Token, scope?: Scope, optional?: boolean): unknown;

    instantiationCount(token: any, scope?: Scope): number;

    clear(): void;

    resolver(token: Token, scope?: Scope, optional?: boolean): Resolver<unknown>;

    setter(token: Token, scopeName?: string): Setter<unknown>;

    collectStack(stack: StackEntry[]): void;
}

type BuiltNormalizedProvider = NormalizedProvider & { needsDestination?: boolean };
type BuiltPreparedProvider = PreparedProvider & { built?: { resolver: string, name: string, label: string } };

/**
 * This is the actual dependency injection container.
 * Every module has its own injector.
 *
 * @reflection never
 */
export class Injector {
    private built?: BuiltInjector;

    private resolverMap = new Map<any, Resolver<unknown>>;
    private setterMap = new Map<any, Setter<unknown>>;

    constructor(
        public readonly module: InjectorModule,
        private buildContext: BuildContext,
    ) {
        module.injector = this;
        this.build(buildContext);
    }

    static from(providers: ProviderWithScope[], parent?: Injector): Injector {
        return new Injector(new InjectorModule(providers, parent?.module), new BuildContext);
    }

    static fromModule(module: InjectorModule): Injector {
        return new Injector(module, new BuildContext);
    }

    get<T>(token?: ReceiveType<T> | Token<T>, scope?: Scope, optional: boolean = false): ResolveToken<T> {
        if (!this.built) throw new Error('Injector was not built');
        token = isPacked(token) ? resolveReceiveType(token) : token;
        return this.built.get(token, scope, optional) as ResolveToken<T>;
    }

    set<T>(token: Token<T>, value: any, scope?: Scope): void {
        if (!this.built) throw new Error('Injector was not built');
        this.built.set(token, value, scope);
    }

    instantiationCount(token: any, scope?: Scope): number {
        if (!this.built) throw new Error('Injector was not built');
        return this.built.instantiationCount(token, scope);
    }

    getSetter<T>(token: ReceiveType<T> | Token<T>, scopeName?: string): Setter<T> {
        let setter = this.setterMap.get(token);
        if (!setter) {
            setter = this.createSetter(token as ReceiveType<T> | Token, scopeName);
            if (!scopeName) this.setterMap.set(token, setter);
        }
        return setter;
    }

    getResolver<T>(token?: ReceiveType<T> | Token<T>, label?: string): Resolver<T> {
        if (!token) throw new Error('No token provided');
        let resolver = this.resolverMap.get(token);
        if (!resolver) {
            resolver = this.createResolver(token as ReceiveType<T> | Token, undefined, label);
            this.resolverMap.set(token, resolver);
        }
        return resolver as Resolver<T>;
    }

    clear() {
        this.built?.clear();
    }

    protected build(buildContext: BuildContext): void {
        const compiler = new CompilerContext();
        compiler.set({
            throwCircularDependency,
            knownServiceNotFoundInScope,
            knownServiceNotFoundError,
            serviceNotFoundError,
            tokenLabel,
            constructorParameterNotFound,
            functionParameterNotFound,
            propertyParameterNotFound,
            factoryDependencyNotFound,
            transientInjectionTargetUnavailable,
            createTransientInjectionTarget,
            getContainerToken,
            stackToPath,
            'injector': this,
            'runtimeContext': buildContext.runtimeContext,
            createResolver: (token: Token, scope?: Scope, label?: string) => {
                return this.createResolver(token, scope, label);
            },
        });

        const functions: string[] = [];
        const init: string[] = [];
        const reset: string[] = [];
        const collect: string[] = [];
        const clear: string[] = [];
        const setReferences: string[] = [];

        const preparedProviders = this.module.getPreparedProviders(buildContext) as BuiltPreparedProvider[];
        for (const prepared of preparedProviders) {
            const i = this.buildContext.providerIndex.reserve();
            const label = tokenLabel(prepared.token);
            const name = 'i' + i + '_' + label.replace(/[^a-zA-Z0-9]/g, '_');
            prepared.built = {
                name,
                label,
                resolver: `resolve${name}`,
            };
        }

        for (const prepared of preparedProviders) {
            if (!prepared.built) continue;
            const name = prepared.built.name;
            const label = prepared.built.label;

            // scopes will be created first, so they are returned instead of the unscoped instance
            prepared.providers.sort((a, b) => {
                if (a.scope && !b.scope) return -1;
                if (!a.scope && b.scope) return +1;
                return 0;
            });

            // console.log(`${label} got ${prepared.providers.length} providers for module ${getClassName(this.module)}. ` +
            //     `scopes ${prepared.providers.map(v => v.scope).join(', ')}. ` +
            //     `resolveFrom=${prepared.resolveFrom ? getClassName(prepared.resolveFrom) : 'none'}. ` +
            //     `resolve from modules ${prepared.modules.map(getClassName).join(', ')}. `);

            const containerToken = getContainerToken(prepared.token);
            const containerTokenVar = compiler.reserveVariable('containerToken', containerToken);

            const factoryNames: {
                scope: string,
                function: string,
            }[] = [];

            const setterNames: {
                scope: string,
                function: string,
            }[] = [];

            const instantiationsNames: {
                scope: string,
                function: string,
            }[] = [];

            if (prepared.resolveFrom) {
                const factory = `factory${name}`;
                const setter = `setter${name}`;
                const instantiations = `instantiations${name}`;

                const injectorVar = compiler.reserveConst(prepared.resolveFrom!.injector, 'injector');

                functions.push(`
                    function ${factory}(scope, optional) {
                        return ${injectorVar}.built.get(${containerTokenVar}, scope, optional);
                    }
                    
                    function ${setter}(value, scope) {
                        ${injectorVar}.built.set(${containerTokenVar}, value, scope);
                    }
                    
                    function ${instantiations}(scope) {
                        return ${injectorVar}.built.instantiationCount(${containerTokenVar}, scope);
                    }
                `);

                if (isClass(containerToken)) {
                    setReferences.push(`
                    ${containerTokenVar}[symbolResolver] = () => ${factory};
                    ${containerTokenVar}[symbolSetter] = () => ${setter};
                    ${containerTokenVar}[symbolInstantiations] = () => ${instantiations};
                    `);
                }

                if (isType(prepared.token) && prepared.token.kind === ReflectionKind.class) {
                    const classTypeVar = compiler.reserveVariable('classType', prepared.token.classType);
                    setReferences.push(`
                    ${classTypeVar}[symbolResolver] = () => ${factory};
                    ${classTypeVar}[symbolSetter] = () => ${setter};
                    ${classTypeVar}[symbolInstantiations] = () => ${instantiations};
                    `);
                }

                setReferences.push(`
                    lookupGetter[${containerTokenVar}] = () => ${factory};
                    lookupSetter[${containerTokenVar}] = () => ${setter};
                    lookupInstantiations[${containerTokenVar}] = () => ${instantiations};
                `);
            } else {
                const scopeNames = JSON.stringify(prepared.providers.map(v => v.scope).filter(v => !!v));

                for (const provider of prepared.providers) {
                    const scope = getScope(provider);
                    const container = scope ? 'scope' : 'instances';
                    const varName = `${container}.${name}`;
                    const state = 's' + prepared.built.name + (scope ? '_' + scope : '');
                    const check = scope ? `if (!scope || scope.name !== ${JSON.stringify(scope)}) return optional ? undefined : knownServiceNotFoundInScope(${JSON.stringify(label)}, ${scopeNames}, scope);` : '';

                    const scopeAffix = scope ? '_' + scope : '_global';
                    const factory = `factory${name}${scopeAffix}`;
                    const setter = `setter${name}${scopeAffix}`;
                    const instantiations = `instantiations${name}${scopeAffix}`;

                    const code = this.createFactoryCode(buildContext, compiler, varName, prepared.token, provider, prepared.modules);

                    init.push(`
                const ${state} = {
                    label: ${JSON.stringify(label)},
                    count: 0,
                    creating: 0,
                    cause: false,
                };`);

                    factoryNames.push({ scope, function: factory });
                    setterNames.push({ scope, function: setter });
                    instantiationsNames.push({ scope, function: instantiations });

                    reset.push(`${state}.creating = 0; ${state}.cause = false;`);
                    collect.push(`if (${state}.creating) stack.push(${state});`);
                    clear.push(`${varName} = undefined;`);

                    let setDestination = ``;
                    let resetDestination = ``;
                    if (code.needsDestination) {
                        const tokenVar = compiler.reserveConst(prepared.token, 'token');
                        setDestination = `const oldContext = runtimeContext.destination; runtimeContext.destination = { token: ${tokenVar} };`;
                        resetDestination = `runtimeContext.destination = oldContext;`;
                    }

                    let circularCheckBefore = '';
                    let circularCheckAfter = '';
                    if (code.dependencies) {
                        circularCheckBefore = `
                        if (${state}.creating > 0) {
                            ${state}.cause = true;
                            const stack = [];
                            collectStack(stack);
                            const paths = stackToPath(stack);
                            reset();
                            throwCircularDependency(paths);
                        }
                        ${state}.creating = ++runtimeContext.creation;
                        `;
                        circularCheckAfter = `${state}.creating = 0;`;
                    }

                    let returnExisting = ``;
                    if (!provider.transient) {
                        returnExisting = `if (${varName}) return ${varName};`;
                    }

                    functions.push(`
                //${label}, from ${prepared.modules.map(getClassName).join(', ')}
                function ${factory}(scope, optional) {
                    ${check}
                    ${returnExisting}
                    ${circularCheckBefore}
                    ${setDestination}
                    try {
                    ${code.code}
                    ${state}.count++;
                    } finally {
                        ${resetDestination}
                        ${state}.creating = 0;
                    }
                    ${circularCheckAfter}
                    if (!${varName} && !optional) knownServiceNotFoundError(${JSON.stringify(label)}, ${scopeNames}, scope);
                    return ${varName};
                }

                function ${setter}(value, scope) {
                    ${check}
                    ${varName} = value;
                }
                
                function ${instantiations}(scope) {
                    ${check}
                    return ${state}.count;
                }
            `);
                }

                if (factoryNames.length > 1) {
                    // we need to override lookup/symbol for the scope
                    // and add a router to correctly route scopes to the function
                    const routerName = `router${name}`;
                    // prepared.factory = `factory_${routerName}`;
                    // an unscoped provider is visible in every scope, also in those without their own provider
                    const unscopedFactory = factoryNames.find(v => !v.scope);
                    const unscopedInstantiations = instantiationsNames.find(v => !v.scope);

                    functions.push(`
                function ${routerName}_factory(scope, optional) {
                    const name = scope?.name || '';
                    switch (name) {
                        ${factoryNames.map(v => `case ${JSON.stringify(v.scope)}: return ${v.function}(scope, optional);`).join('\n')}
                        default: {
                            ${unscopedFactory ? `return ${unscopedFactory.function}(scope, optional);` : ''}
                            if (optional) return undefined;
                            knownServiceNotFoundInScope(${JSON.stringify(label)}, ${scopeNames}, scope);
                        }
                    }
                }

                // scope router for ${factoryNames.map(v => v.scope).join(', ')}
                function ${prepared.built.resolver}(scope, optional) {
                    const name = scope?.name || '';
                    switch (name) {
                        ${factoryNames.map(v => `case ${JSON.stringify(v.scope)}: return ${v.function};`).join('\n')}
                        default: return ${routerName}_factory; // no scope given, so return route for value itself
                    }
                }
                
                function ${routerName}_setter(value, scope, optional) {
                    const name = scope?.name || '';
                    switch (name) {
                        ${setterNames.map(v => `case ${JSON.stringify(v.scope)}: return ${v.function}(value, scope, optional);`).join('\n')}
                        // default: knownServiceNotFoundInScope(${JSON.stringify(label)}, ${scopeNames}, scope);
                        default: {
                            if (optional) return undefined;
                            knownServiceNotFoundInScope(${JSON.stringify(label)}, ${scopeNames}, scope);
                        }
                    }
                }
                
                function setter_${routerName}(scopeName) {
                    switch (scopeName) {
                        ${setterNames.map(v => `case ${JSON.stringify(v.scope)}: return ${v.function};`).join('\n')}
                        default: return ${routerName}_setter; // no scope given, so return route for value itself
                    }
                }
                
                function instantiations_${routerName}(scope) {
                    const name = scope?.name || '';
                    switch (name) {
                        ${instantiationsNames.map(v => `case ${JSON.stringify(v.scope)}: return ${v.function};`).join('\n')}
                        default: ${unscopedInstantiations ? `return ${unscopedInstantiations.function};` : `knownServiceNotFoundInScope(${JSON.stringify(label)}, ${scopeNames}, scope);`}
                    }
                }
                `);

                    if (isClass(containerToken)) {
                        setReferences.push(`
                        ${containerTokenVar}[symbolResolver] = ${prepared.built.resolver};
                        ${containerTokenVar}[symbolSetter] = setter_${routerName};
                        ${containerTokenVar}[symbolInstantiations] = instantiations_${routerName};
                        `);
                    }

                    if (isType(prepared.token) && prepared.token.kind === ReflectionKind.class) {
                        const classTypeVar = compiler.reserveVariable('classType', prepared.token.classType);
                        setReferences.push(`
                        ${classTypeVar}[symbolResolver] = ${prepared.built.resolver};
                        ${classTypeVar}[symbolSetter] = setter_${routerName};
                        ${classTypeVar}[symbolInstantiations] = instantiations_${routerName};
                        `);
                    }

                    setReferences.push(`
                        lookupGetter[${containerTokenVar}] = ${prepared.built.resolver};
                        lookupSetter[${containerTokenVar}] = setter_${routerName};
                        lookupInstantiations[${containerTokenVar}] = instantiations_${routerName};
                    `);
                } else if (factoryNames.length === 1) {
                    const factory = factoryNames[0].function;
                    const setter = setterNames[0].function;
                    const instantiations = instantiationsNames[0].function;

                    functions.push(`
                    const ${prepared.built.resolver} = () => ${factory};
                    `);

                    if (isClass(containerToken)) {
                        setReferences.push(`
                        ${containerTokenVar}[symbolResolver] = ${prepared.built.resolver};
                        ${containerTokenVar}[symbolSetter] = () => ${setter};
                        ${containerTokenVar}[symbolInstantiations] = () => ${instantiations};
                        `);
                    }

                    if (isType(prepared.token) && prepared.token.kind === ReflectionKind.class) {
                        const classTypeVar = compiler.reserveVariable('classType', prepared.token.classType);
                        setReferences.push(`
                        ${classTypeVar}[symbolResolver] = ${prepared.built.resolver};
                        ${classTypeVar}[symbolSetter] = () => ${setter};
                        ${classTypeVar}[symbolInstantiations] = () => ${instantiations};
                        `);
                    }

                    setReferences.push(`
                        lookupGetter[${containerTokenVar}] = ${prepared.built.resolver};
                        lookupSetter[${containerTokenVar}] = () => ${setter};
                        lookupInstantiations[${containerTokenVar}] = () => ${instantiations};
                    `);
                }
            }
        }

        // console.log(`built injector for ${getClassName(this.module)}`);

        this.built = compiler.raw(`
    //for ${getClassName(this.module)}

    const instances = {};
    const state = {
        faulty: 0,
        creating: 1
    };
    const lookupGetter = {};
    const lookupSetter = {};
    const lookupInstantiations = {};
    
    const symbolResolver = Symbol('resolver');
    const symbolSetter = Symbol('setter');
    const symbolInstantiations = Symbol('instantiations');
    
    // collectStack(stack: { label: string, id: number }[]): void
    function collectStack(stack) {
        ${collect.join('\n')}
        ${this.module.imports.map(v => `${compiler.reserveConst(v)}.injector.built.collectStack(stack);`).join('\n')}
    }
    
    function reset() {
        runtimeContext.creation = 0;
        ${reset.join('\n')}
    }
    
    function noop() {}

    ${init.join('\n')}
    
    ${functions.join('\n')}
    
    ${setReferences.join('\n')}

    // resolver(token: Token, scope?: Scope, optional?: boolean): Resolver<unknown>;
    function resolver(token, scope, optional) {
        // token could be: Type, ClassType, or primitive
        const containerToken = getContainerToken(token);
        const fn = containerToken[symbolResolver] || lookupGetter[containerToken];
        if (fn) return fn(scope);

        const resolver = createResolver(token, scope);
        if (resolver) {
            lookupSetter[containerToken] = resolver;
            return resolver;
        }
        
        if (optional) return noop;
        throw serviceNotFoundError(tokenLabel(token));
    }
    
    // setter(token: Token, scopeName?: string): Setter<unknown>;
    function setter(token, scopeName) {
        const containerToken = getContainerToken(token);
        const fn = containerToken[symbolSetter] || lookupSetter[containerToken];
        if (fn) return fn(scopeName);
        throw serviceNotFoundError(tokenLabel(token));
    }
    
    // set(token: Token, value: any, scope?: Scope): void;
    function set(token, value, scope) {
        setter(token, scope?.name)(value, scope);
    }

    // get(token: Token, scope?: Scope, optional?: boolean): unknown;
    function get(token, scope, optional) {
        return resolver(token, scope)(scope, optional);
    }
    
    // clear(): void;
    function clear() {
        ${clear.join('\n')}
    }
    
    // instantiationCount<T>(token: any, scope?: string): number;
    function instantiationCount(token, scope) {
        const containerToken = getContainerToken(token);
        const fn = lookupInstantiations[containerToken];
        if (fn) return fn(scope)(scope);
        return 0;
    }
    
    return { resolver, setter, get, set, clear, instantiationCount, collectStack };
    `) as any;
    }

    protected createFactoryCode(
        buildContext: BuildContext,
        compiler: CompilerContext,
        varName: string,
        token: Token,
        provider: BuiltNormalizedProvider,
        resolveDependenciesFrom: InjectorModule[],
    ) {
        let transient = false;
        let factory: { code: string, dependencies: number } = { code: '', dependencies: 0 };

        if (isValueProvider(provider)) {
            transient = provider.transient === true;
            const valueVar = compiler.reserveVariable('useValue', provider.useValue);
            factory.code = `${varName} = ${valueVar};`;
        } else if (isClassProvider(provider)) {
            transient = provider.transient === true;

            let useClass = provider.useClass;
            if (!useClass) {
                if (isClass(provider.provide)) useClass = provider.provide as ClassType;
                if (isType(provider.provide) && provider.provide.kind === ReflectionKind.class) useClass = provider.provide.classType;
                if (!useClass) {
                    throw new Error(`UseClassProvider needs to set either 'useClass' or 'provide' as a ClassType. Got ${provider.provide as any}`);
                }
            }
            factory = this.createFactory(provider, varName, compiler, useClass, resolveDependenciesFrom);
        } else if (isExistingProvider(provider)) {
            transient = provider.transient === true;
            const existingToken = compiler.reserveConst(getContainerToken(provider.useExisting));
            factory.code = `${varName} = injector.built.get(${existingToken}, scope, optional);`;
        } else if (isFactoryProvider(provider)) {
            transient = provider.transient === true;
            const args: string[] = [];
            const reflection = ReflectionFunction.from(provider.useFactory);
            const ofName = reflection.name === 'anonymous' ? 'useFactory' : reflection.name;

            for (const parameter of reflection.getParameters()) {
                factory.dependencies++;
                const tokenType = getInjectOptions(parameter.getType() as Type);
                args.push(this.createFactoryProperty({
                    name: parameter.name,
                    type: tokenType || parameter.getType() as Type,
                    optional: !parameter.isValueRequired(),
                }, provider, compiler, resolveDependenciesFrom, ofName, args.length, 'factoryDependencyNotFound'));
            }

            factory.code = `${varName} = ${compiler.reserveVariable('factory', provider.useFactory)}(${args.join(', ')});`;
        } else {
            throw new Error('Invalid provider');
        }

        const configureProvider: string[] = [];

        const configurations: ConfigureProviderEntry[] = [];
        for (const module of resolveDependenciesFrom) {
            configurations.push(...module.configurationProviderRegistry.get(token));
        }
        configurations.push(...buildContext.globalConfigurationProviderRegistry.get(token));

        if (configurations?.length) {
            configurations.sort((a, b) => {
                return a.options.order - b.options.order;
            });

            for (const configure of configurations) {
                const args: string[] = [varName];
                const reflection = ReflectionFunction.from(configure.call);
                const ofName = reflection.name === 'anonymous' ? 'configureProvider' : reflection.name;

                for (const parameter of reflection.getParameters().slice(1)) {
                    const tokenType = getInjectOptions(parameter.getType() as Type);
                    args.push(this.createFactoryProperty({
                        name: parameter.name,
                        type: tokenType || parameter.getType() as Type,
                        optional: !parameter.isValueRequired(),
                    }, provider, compiler, resolveDependenciesFrom, ofName, args.length, 'functionParameterNotFound'));
                }

                const call = `${compiler.reserveVariable('configure', configure.call)}(${args.join(', ')});`;
                if (configure.options.replace) {
                    configureProvider.push(`${varName} = ${call}`);
                } else {
                    configureProvider.push(call);
                }

            }
        } else {
            configureProvider.push('//no custom provider setup');
        }

        return {
            transient,
            dependencies: factory.dependencies,
            needsDestination: !!provider.needsDestination,
            code: `
            ${factory.code}
            if (${varName} !== undefined) {
                ${configureProvider.join('\n')}
            }
        `,
        };
    }

    protected createFactory(
        provider: BuiltNormalizedProvider,
        resolvedName: string,
        compiler: CompilerContext,
        classType: ClassType,
        resolveDependenciesFrom: InjectorModule[],
    ): { code: string, dependencies: number } {
        if (!classType) throw new Error('Can not create factory for undefined ClassType');
        const reflectionClass = ReflectionClass.from(classType);
        const args: string[] = [];
        const propertyAssignment: string[] = [];
        const classTypeVar = compiler.reserveVariable('classType', classType);

        let dependencies: number = 0;

        const constructor = reflectionClass.getMethodOrUndefined('constructor');
        const constructorProperties: string[] = [];
        if (constructor) {
            for (const parameter of constructor.getParameters()) {
                if (parameter.getVisibility() !== undefined) constructorProperties.push(parameter.name);
                dependencies++;
                const tokenType = getInjectOptions(parameter.getType() as Type);
                args.push(this.createFactoryProperty({
                    name: parameter.name,
                    type: tokenType || parameter.getType() as Type,
                    optional: !parameter.isValueRequired(),
                }, provider, compiler, resolveDependenciesFrom, getClassName(classType), args.length, 'constructorParameterNotFound'));
            }
        }

        for (const property of reflectionClass.getProperties()) {
            if (constructorProperties.includes(property.name)) continue; // already assigned in constructor
            const tokenType = getInjectOptions(property.type);
            if (!tokenType) continue;

            dependencies++;
            try {
                const resolveProperty = this.createFactoryProperty({
                    name: property.name,
                    type: tokenType,
                    optional: !property.isValueRequired(),
                }, provider, compiler, resolveDependenciesFrom, getClassName(classType), -1, 'propertyParameterNotFound');
                propertyAssignment.push(`${resolvedName}.${String(property.getName())} = ${resolveProperty};`);
            } catch (error: any) {
                throw new Error(`Could not resolve property injection token ${getClassName(classType)}.${String(property.getName())}: ${error.message}`);
            }
        }

        return {
            code: `${resolvedName} = new ${classTypeVar}(${args.join(',')});\n${propertyAssignment.join('\n')}`,
            dependencies,
        };
    }

    protected createFactoryProperty(
        options: { name: string, type: Type, optional: boolean },
        fromProvider: BuiltNormalizedProvider,
        compiler: CompilerContext,
        resolveDependenciesFrom: InjectorModule[],
        ofName: string,
        argPosition: number,
        notFoundFunction: string,
    ): string {
        let of = `${ofName}.${options.name}`;

        if (options.type.kind === ReflectionKind.class) {
            const found = findModuleForConfig(options.type.classType, resolveDependenciesFrom);
            if (found) {
                return compiler.reserveVariable('fullConfig', getPathValue(found.module.getConfig(), found.path));
            }
        }

        if (options.type.kind === ReflectionKind.class && options.type.classType === TransientInjectionTarget) {
            if (fromProvider.transient === true) {
                const tokenVar = compiler.reserveVariable('token', options.type.classType);
                const orThrow = options.optional ? '' : `?? transientInjectionTargetUnavailable(${JSON.stringify(ofName)}, ${JSON.stringify(options.name)}, ${argPosition}, ${tokenVar})`;
                return `createTransientInjectionTarget(runtimeContext.destination) ${orThrow}`;
            } else {
                throw new Error(`Cannot inject ${TransientInjectionTarget.name} into ${JSON.stringify(ofName)}.${JSON.stringify(options.name)}, as ${JSON.stringify(ofName)} is not transient`);
            }
        }

        if (options.type.kind === ReflectionKind.class && options.type.classType === InjectorModule) {
            // the last entry is always the module that defined the provider (no matter if it was exported)
            const module = resolveDependenciesFrom[resolveDependenciesFrom.length - 1];
            return compiler.reserveVariable('module', module);
        }


        if (options.type.kind === ReflectionKind.class && options.type.classType === Injector) {
            // the last entry is always the module that defined the provider (no matter if it was exported)
            const module = resolveDependenciesFrom[resolveDependenciesFrom.length - 1];
            return `${compiler.reserveVariable('module', module)}.injector`;
        }

        if (options.type.kind === ReflectionKind.class && options.type.classType === TagRegistry) {
            return compiler.reserveVariable('tagRegistry', this.buildContext.tagRegistry);
        }

        if (options.type.kind === ReflectionKind.class) {
            for (const module of resolveDependenciesFrom) {
                if (module instanceof options.type.classType) {
                    return compiler.reserveConst(module, 'module');
                }
            }
        }

        if (options.type.kind === ReflectionKind.class && isPrototypeOfBase(options.type.classType, Tag)) {
            const tokenVar = compiler.reserveVariable('token', options.type.classType);
            const resolvedVar = compiler.reserveVariable('tagResolved');
            const entries = this.buildContext.tagRegistry.resolve(options.type.classType);
            const args: string[] = [];
            for (const entry of entries) {
                args.push(`${compiler.reserveConst(entry.module)}.injector.built.get(${compiler.reserveConst(getContainerToken(entry.tagProvider.provider.provide))}, scope)`);
            }
            return `new ${tokenVar}(${resolvedVar} || (${resolvedVar} = [${args.join(', ')}]))`;
        }

        if (options.type.kind === ReflectionKind.function && options.type.typeName === 'PartialFactory') {
            const type = options.type.typeArguments?.[0];
            const factory = partialFactory(type, this);
            const factoryVar = compiler.reserveConst(factory, 'factory');
            return `${factoryVar}(scope)`;
        }

        if (options.type.kind === ReflectionKind.objectLiteral) {
            const pickArguments = getPickArguments(options.type);
            if (pickArguments) {
                if (pickArguments[0].kind === ReflectionKind.class) {
                    const found = findModuleForConfig(pickArguments[0].classType, resolveDependenciesFrom);
                    if (found) {
                        const fullConfig = compiler.reserveVariable('fullConfig', getPathValue(found.module.getConfig(), found.path));
                        let index = pickArguments[1];
                        if (index.kind === ReflectionKind.literal) {
                            index = { kind: ReflectionKind.union, types: [index] };
                        }
                        if (index.kind === ReflectionKind.union) {
                            const members: string[] = [];
                            for (const t of index.types) {
                                if (t.kind === ReflectionKind.literal) {
                                    const index = JSON.stringify(t.literal);
                                    members.push(`${index}: ${fullConfig}[${index}]`);
                                }
                            }

                            return `{${members.join(', ')}}`;
                        }
                    }
                }
            }
        }

        if (options.type.indexAccessOrigin) {
            let current = options.type;
            let module = undefined as InjectorModule | undefined;
            const accesses: string[] = [];

            while (current && current.indexAccessOrigin) {
                let found: { module: InjectorModule, path: string } | undefined = undefined;
                if (current.indexAccessOrigin.container.kind === ReflectionKind.class) {
                    found = findModuleForConfig(current.indexAccessOrigin.container.classType, resolveDependenciesFrom);
                }
                if (current.indexAccessOrigin.index.kind === ReflectionKind.literal) {
                    accesses.unshift(`[${JSON.stringify(current.indexAccessOrigin.index.literal)}]`);
                }
                current = current.indexAccessOrigin.container;
                if (found) {
                    module = found.module;
                    if (found.path) accesses.unshift(`[${JSON.stringify(found.path)}]`);
                    break;
                }
            }
            if (module) {
                const fullConfig = compiler.reserveVariable('fullConfig', module.getConfig());
                return `${fullConfig}${accesses.join('')}`;
            }
        }

        let foundPreparedProvider: BuiltPreparedProvider | undefined = undefined;
        for (const module of resolveDependenciesFrom) {
            foundPreparedProvider = module.getPreparedProvider(options.type, foundPreparedProvider);
        }

        if (resolveDependenciesFrom[0] !== this.module) {
            //the provider was exported from another module, so we need to check if there is a more specific candidate
            foundPreparedProvider = this.module.getPreparedProvider(options.type, foundPreparedProvider);
        }
        const fromScope = getScope(fromProvider);

        function invalidMatch(foundPreparedProvider?: PreparedProvider): boolean {
            if (!foundPreparedProvider) return true;
            const allPossibleScopes = foundPreparedProvider.providers.map(getScope);
            const unscoped = allPossibleScopes.includes('') && allPossibleScopes.length === 1;
            return !unscoped && !allPossibleScopes.includes(fromScope);
        }

        // go up parent hierarchy and find a match
        let current: InjectorModule | undefined = this.module;
        while (current && invalidMatch(foundPreparedProvider)) {
            foundPreparedProvider = current.getPreparedProvider(options.type, foundPreparedProvider);
            current = current.parent;
        }

        if (!foundPreparedProvider && options.optional) return 'undefined';

        if (!foundPreparedProvider) {
            if (argPosition >= 0) {
                const argsCheck: string[] = [];
                for (let i = 0; i < argPosition; i++) argsCheck.push('✓');
                argsCheck.push('?');
                of = `${ofName}(${argsCheck.join(', ')})`;
            }

            const type = stringifyType(options.type, { showFullDefinition: false }).replace(/\n/g, '').replace(/\s\s+/g, ' ').replace(' & InjectMeta', '');
            if (options.optional) return 'undefined';
            throw new DependenciesUnmetError(
                `Undefined dependency "${options.name}: ${type}" of ${of}. Type has no provider${fromScope ? ' in scope ' + fromScope : ''}.`,
            );
        }

        const tokenVar = compiler.reserveVariable('token', getContainerToken(foundPreparedProvider.token));
        const foundProviderLabel = foundPreparedProvider.providers.map(v => v.provide).map(tokenLabel).join(', ');

        if (invalidMatch(foundPreparedProvider)) {
            const allPossibleScopes = foundPreparedProvider.providers.map(getScope);
            const t = stringifyType(options.type, { showFullDefinition: false });
            throw new DependenciesUnmetError(
                `Dependency '${options.name}: ${t}' of ${of} can not be injected into ${fromScope ? 'scope ' + fromScope : 'no scope'}, ` +
                `since ${foundProviderLabel} only exists in scope${allPossibleScopes.length === 1 ? '' : 's'} ${allPossibleScopes.join(', ')}.`,
            );
        }

        //when the dependency is FactoryProvider it might return undefined.
        //in this case, if the dependency is not optional, we throw an error.
        const orThrow = options.optional ? '' : `?? ${notFoundFunction}(${JSON.stringify(ofName)}, ${JSON.stringify(options.name)}, ${argPosition}, ${tokenVar})`;

        if (isTransientInjectionTargetProvider(foundPreparedProvider)) {
            fromProvider.needsDestination = true;
        }

        if (foundPreparedProvider.resolveFrom) {
            const injectorVar = compiler.reserveConst(foundPreparedProvider.resolveFrom.injector, 'injector');
            return `${injectorVar}.built.get(${tokenVar}, scope, true) ${orThrow}`;
        }

        const resolveFromModule = foundPreparedProvider.resolveFrom || foundPreparedProvider.modules[0];
        if (resolveFromModule === this.module) {
            if (foundPreparedProvider.built) {
                return `${foundPreparedProvider.built.resolver}(scope, true)(scope, true) ${orThrow}`;
            }
            return `resolver(${tokenVar}, scope, true)(scope, true) ${orThrow}`;
        }

        // go through module injector
        return `${compiler.reserveConst(resolveFromModule)}.injector.built.resolver(${tokenVar}, scope, true)(scope, true) ${orThrow}`;
    }

    protected resolveType(type: Type): PreparedProvider | undefined {
        const resolveDependenciesFrom = [this.module];

        let foundPreparedProvider: PreparedProvider | undefined = undefined;
        for (const module of resolveDependenciesFrom) {
            foundPreparedProvider = module.getPreparedProvider(type, foundPreparedProvider);
        }

        if (resolveDependenciesFrom[0] !== this.module) {
            //the provider was exported from another module, so we need to check if there is a more specific candidate
            foundPreparedProvider = this.module.getPreparedProvider(type, foundPreparedProvider);
        }

        if (!foundPreparedProvider) {
            //go up parent hierarchy
            let current: InjectorModule | undefined = this.module;
            while (current && !foundPreparedProvider) {
                foundPreparedProvider = current.getPreparedProvider(type, foundPreparedProvider);
                current = current.parent;
            }
        }

        return foundPreparedProvider;
    }

    createSetter<T>(token: ReceiveType<T> | Token<T>, scopeName?: string, label?: string): Setter<T> {
        if (token instanceof TagProvider) token = token.provider.provide;

        // todo remove isClass since it's slow
        let type: Type | undefined = isType(token) ? token : isArray(token) || isClass(token) ? resolveReceiveType(token) : undefined;

        if (!type) {
            const containerToken = getContainerToken(token as Token);
            return this.built!.setter(containerToken);
        }

        const foundPreparedProvider = this.resolveType(type);

        if (!foundPreparedProvider) {
            const t = stringifyType(type, { showFullDefinition: false });
            const message = label ? `${label}: ${t}` : t;
            throw serviceNotFoundError(message);
        }

        const containerToken = getContainerToken(foundPreparedProvider.token);
        const resolveFromModule = foundPreparedProvider.resolveFrom || foundPreparedProvider.modules[0];
        return resolveFromModule.injector!.built!.setter(containerToken, scopeName);
    }

    createResolver<T>(token: ReceiveType<T> | Token<T>, scope?: Scope, label?: string): Resolver<T> {
        if (token instanceof TagProvider) token = token.provider.provide;

        // todo remove isClass since it's slow
        let type: Type | undefined = isType(token) ? token : isArray(token) || isClass(token) ? resolveReceiveType(token) : undefined;

        if (!type) {
            const containerToken = getContainerToken(token as Token);
            return this.built!.resolver(containerToken, scope) as any;
        }

        const resolveDependenciesFrom = [this.module];
        const optional = isOptional(type);
        if (type.kind === ReflectionKind.propertySignature || type.kind === ReflectionKind.property) type = type.type;
        if (type.kind === ReflectionKind.parameter) type = type.type;

        type = getInjectOptions(type) || type;

        // if (type.kind === ReflectionKind.union) {
        //     type = type.types.some(v => v.kind !== ReflectionKind.undefined);
        // }

        if (type.kind === ReflectionKind.class) {
            const found = findModuleForConfig(type.classType, resolveDependenciesFrom);
            if (found) return () => getPathValue(found.module.getConfig(), found.path);
        }

        if (type.kind === ReflectionKind.class && type.classType === TagRegistry) return (() => this.buildContext.tagRegistry) as any;

        if (type.kind === ReflectionKind.class) {
            for (const module of resolveDependenciesFrom) {
                if (module instanceof type.classType) return (() => module) as any;
            }
        }

        if (type.kind === ReflectionKind.class && isPrototypeOfBase(type.classType, Tag)) {
            const entries = this.buildContext.tagRegistry.resolve(type.classType);
            const args: any[] = [];
            for (const entry of entries) {
                args.push(entry.module.injector!.built!.resolver(entry.tagProvider.provider.provide, scope));
            }

            return new type.classType(args);
        }

        if (type.kind === ReflectionKind.function && type.typeName === 'PartialFactory') {
            const factoryType = type.typeArguments?.[0];
            const factory = partialFactory(factoryType, this);
            return ((scopeIn?: Scope) => factory(scopeIn)) as any;
        }

        if (isWithAnnotations(type)) {
            if (type.kind === ReflectionKind.objectLiteral) {
                const pickArguments = getPickArguments(type);
                if (pickArguments) {
                    if (pickArguments[0].kind === ReflectionKind.class) {
                        const found = findModuleForConfig(pickArguments[0].classType, resolveDependenciesFrom);
                        if (found) {
                            const fullConfig = getPathValue(found.module.getConfig(), found.path);
                            let index = pickArguments[1];
                            if (index.kind === ReflectionKind.literal) {
                                index = { kind: ReflectionKind.union, types: [index] };
                            }
                            if (index.kind === ReflectionKind.union) {
                                const pickedConfig: { [name: string]: any } = {};
                                for (const t of index.types) {
                                    if (t.kind === ReflectionKind.literal) {
                                        const index = JSON.stringify(t.literal);
                                        pickedConfig[index] = fullConfig[index];
                                    }
                                }

                                return (() => pickedConfig) as any;
                            }
                        }
                    }
                }
            }

            if (type.indexAccessOrigin) {
                let current = type;
                let config: { [name: string]: any } | undefined = undefined;

                while (current && current.indexAccessOrigin) {
                    if (current.indexAccessOrigin.container.kind === ReflectionKind.class) {
                        const found = findModuleForConfig(current.indexAccessOrigin.container.classType, resolveDependenciesFrom);
                        // Only because it has indexAccessOrigin as class doesn't mean it must be a config reference.
                        // We can safely ignore it if it's not a config reference.
                        if (found) {
                            config = getPathValue(found.module.getConfig(), found.path);
                        }
                    }
                    if (config !== undefined && current.indexAccessOrigin.index.kind === ReflectionKind.literal) {
                        const index = current.indexAccessOrigin.index.literal;
                        config = config[String(index)];
                    }
                    current = current.indexAccessOrigin.container;
                }

                if (config !== undefined) return (() => config) as any;
            }
        }

        const foundPreparedProvider = this.resolveType(type);
        if (!foundPreparedProvider) {
            if (optional) return (() => undefined) as any;

            const t = stringifyType(type, { showFullDefinition: false });
            const message = label ? `${label}: ${t}` : t;
            throw serviceNotFoundError(message);
        }

        const containerToken = getContainerToken(foundPreparedProvider.token);
        const resolveFromModule = foundPreparedProvider.resolveFrom || foundPreparedProvider.modules[0];
        if (!resolveFromModule.injector?.built) {
            throw new Error('Injector was not built');
        }

        return resolveFromModule.injector.built.resolver(containerToken, scope) as Resolver<T>;
    }
}

class BuildProviderIndex {
    protected offset: number = 0;

    reserve(): number {
        return this.offset++;
    }
}

export class BuildContext {
    static ids: number = 0;
    id: number = BuildContext.ids++;

    // this is shared in all built injectors to track the instantiation stack
    // for circular dependency detection.
    runtimeContext = { creation: 0 };

    tagRegistry: TagRegistry = new TagRegistry;
    providerIndex: BuildProviderIndex = new BuildProviderIndex;

    /**
     * In the process of preparing providers, each module redirects their
     * global setup calls in this registry.
     */
    globalConfigurationProviderRegistry: ConfigurationProviderRegistry = new ConfigurationProviderRegistry;
}

export interface Resolver<T> {
    (scope: Scope | undefined, optional: true): T | undefined;

    (scope?: Scope, optional?: boolean): T;
}

export type Setter<T> = (value: T, scope?: Scope, optional?: boolean) => void;

/**
 * A InjectorContext is responsible for taking a root InjectorModule and build all Injectors.
 *
 * It also can create scopes aka a sub InjectorContext with providers from a particular scope.
 */
export class InjectorContext {
    constructor(
        public rootModule: InjectorModule,
        public scope?: Scope,
    ) {
    }

    /**
     * Returns a resolver for the given token. The returned resolver can
     * be executed to resolve the token. This increases performance in hot paths.
     */
    resolve<T>(module?: InjectorModule, type?: ReceiveType<T> | Token<T>): Resolver<T> {
        const injector = this.getInjector(module || this.rootModule);
        return injector.getResolver(type) as Resolver<T>;
    }

    setter<T>(module?: InjectorModule, type?: ReceiveType<T> | Token<T>, scopeName?: string): Setter<T> {
        const injector = this.getInjector(module || this.rootModule);
        return injector.getSetter(type, scopeName || this.scope?.name) as Setter<T>;
    }

    /**
     * Returns an instance of the given token or type from the injector associated with the specified module.
     *
     * If there is no provider for the token or the provider returns undefined, it returns undefined.
     */
    getOrUndefined<T>(token?: ReceiveType<T> | Token<T>, module?: InjectorModule): ResolveToken<T> | undefined {
        const injector = (module || this.rootModule).getOrCreateInjector();
        return injector.get(token, this.scope, true);
    }

    /**
     * Returns an instance of the given token or type from the injector associated with the specified module.
     *
     * If there is no provider for the token or the provider returns undefined, it throws an error.
     */
    get<T>(token?: ReceiveType<T> | Token<T>, module?: InjectorModule): ResolveToken<T> {
        const injector = (module || this.rootModule).getOrCreateInjector();
        return injector.get(token, this.scope) as ResolveToken<T>;
    }

    /**
     * Returns the instantiation count of the given token.
     *
     * This is either 0 or 1 for normal providers, and >= 0 for transient or scoped providers.
     */
    instantiationCount(token: Token, module?: InjectorModule, scope?: string): number {
        const injector = this.getInjector(module || this.rootModule);
        return injector.instantiationCount(token, scope ? { name: scope } : this.scope);
    }

    /**
     * Sets a value for the given token in the injector associated with the specified module.
     *
     * This is useful for scoped providers like HttpRequest that are created dynamically
     * outside the injector container and need to be injected into services.
     */
    set<T>(token: T, value: any, module?: InjectorModule): void {
        const injector = (module || this.rootModule).getOrCreateInjector();
        return injector.set(token, value, this.scope);
    }

    static forProviders(providers: ProviderWithScope[]) {
        return new InjectorContext(new InjectorModule(providers));
    }

    getInjector(module: InjectorModule): Injector {
        return module.getOrCreateInjector();
    }

    getRootInjector(): Injector {
        return this.getInjector(this.rootModule);
    }

    createChildScope(scope: string): InjectorContext {
        return new InjectorContext(this.rootModule, { name: scope });
    }
}

export function injectedFunction<T extends (...args: any) => any>(
    fn: T,
    injector: Injector,
    skipParameters: number = 0,
    type?: Type,
    skipTypeParameters?: number,
): ((scope?: Scope, ...args: any[]) => ReturnType<T>) {
    type = type || reflect(fn);
    skipTypeParameters = skipTypeParameters === undefined ? skipParameters : skipTypeParameters;
    if (type.kind === ReflectionKind.function || type.kind === ReflectionKind.method) {
        const args: Resolver<any>[] = [];
        for (let i = skipTypeParameters; i < type.parameters.length; i++) {
            const parameter = type.parameters[i];
            const resolver = injector.getResolver(parameter, parameter.name);
            args.push((scope?: Scope) => resolver(scope, parameter.optional));
        }

        if (skipParameters === 0) {
            return ((scope: Scope | undefined) => {
                return fn(...(args.map(v => v(scope))));
            }) as any;
        } else if (skipParameters === 1) {
            return ((scope: Scope | undefined, p1: any) => {
                return fn(p1, ...(args.map(v => v(scope))));
            }) as any;
        } else if (skipParameters === 2) {
            return ((scope: Scope | undefined, p1: any, p2: any) => {
                return fn(p1, p2, ...(args.map(v => v(scope))));
            }) as any;
        } else if (skipParameters === 3) {
            return ((scope: Scope | undefined, p1: any, p2: any, p3: any) => {
                return fn(p1, p2, p3, ...(args.map(v => v(scope))));
            }) as any;
        } else {
            return ((scope: Scope | undefined, ...input: any[]) => {
                while (input.length !== skipParameters) {
                    input.push(undefined);
                }
                return fn(...input.slice(0, skipParameters), ...(args.map(v => v(scope))));
            }) as any;
        }
    }
    return fn;
}

export function partialFactory(
    type: Type | undefined,
    injector: Injector,
) {
    if (!type) throw new Error('Can not create partial factory for undefined type');

    // must be lazy because creating resolvers for types that are never resolved & unresolvable will throw
    function createLazyResolver(type: Type, label?: string): Resolver<any> {
        let resolver: Resolver<any> | undefined = undefined;
        return (scope?: Scope) => {
            if (!resolver) {
                resolver = injector.getResolver(type, label);
            }
            return resolver(scope);
        };
    }

    if (type.kind === ReflectionKind.class) {
        const classType = type.classType;
        const reflectionClass = ReflectionClass.from(classType);

        const args: { name: string; resolve: (scope?: Scope) => ReturnType<Resolver<any>> }[] = [];
        const constructor = reflectionClass.getMethodOrUndefined('constructor');
        const constructorProperties: string[] = [];
        if (constructor) {
            for (const parameter of constructor.getParameters()) {
                if (parameter.getVisibility() !== undefined) constructorProperties.push(parameter.name);
                args.push({
                    name: parameter.name,
                    resolve: createLazyResolver(parameter.getType() as Type, parameter.name),
                });
            }
        }

        const properties = new Map<keyof any, (scope?: Scope) => ReturnType<Resolver<any>>>();
        for (const property of reflectionClass.getProperties()) {
            if (constructorProperties.includes(property.name)) continue; // already assigned in constructor
            const tokenType = getInjectOptions(property.type);
            if (!tokenType) continue;

            properties.set(property.getName(), createLazyResolver(tokenType, property.name));
        }

        return (scope?: Scope) => <T>(partial: Partial<{ [K in keyof T]: T[K] }>) => {
            const instance = new classType(...(args.map((v) => partial[v.name as keyof T] ?? v.resolve(scope))));
            for (const [property, resolve] of properties.entries()) {
                instance[property] ??= partial[property as keyof T] ?? resolve(scope);
            }
            return instance as T;
        };
    }

    if (type.kind === ReflectionKind.objectLiteral) {
        const properties = new Map<keyof any, (scope?: Scope) => ReturnType<Resolver<any>>>();
        for (const property of type.types) {
            if (property.kind !== ReflectionKind.propertySignature) continue;
            properties.set(property.name, createLazyResolver(property, String(property.name)));
        }

        return (scope?: Scope) => <T>(partial: Partial<{ [K in keyof T]: T[K] }>) => {
            const obj: any = {};
            for (const [property, resolve] of properties.entries()) {
                obj[property] = partial[property as keyof T] ?? resolve(scope);
            }
            return obj as T;
        };
    }

    throw new Error(`Can not create partial factory for ${stringifyType(type, { showFullDefinition: false })}`);
}
