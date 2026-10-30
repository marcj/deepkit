import { NormalizedProvider, ProviderWithScope, TagProvider, Token } from './provider.js';
import { arrayRemoveItem, ClassType, getClassName, isClass, isPlainObject, isPrototypeOfBase } from '@deepkit/core';
import { BuildContext, getContainerToken, Injector, resolveToken } from './injector.js';
import {
    hasTypeInformation,
    isType,
    ReceiveType,
    reflect,
    ReflectionKind,
    reflectOrUndefined,
    resolveReceiveType,
    Type,
    TypeClass,
    typeInfer,
    TypeObjectLiteral,
    visit,
} from '@deepkit/type';
import { nominalCompatibility } from './types.js';

export interface ConfigureProviderOptions {
    /**
     * If there are several registered configuration functions for the same token,
     * they are executed in order of their `order` value ascending. The default is 0.
     * The lower the number, the earlier it is executed.
     */
    order: number;

    /**
     * Replaces the instance with the value returned by the configuration function.
     */
    replace: boolean;

    /**
     * Per default only providers in the same module are configured.
     * If you want to configure providers of all modules, set this to true.
     */
    global: boolean;
}

export interface ConfigureProviderEntry {
    type: Type;
    options: ConfigureProviderOptions;
    call: Function;
}

export class ConfigurationProviderRegistry {
    public configurations: ConfigureProviderEntry[] = [];

    public add(type: Type, call: Function, options: ConfigureProviderOptions) {
        this.configurations.push({ type, options, call });
    }

    mergeInto(registry: ConfigurationProviderRegistry): void {
        for (const { type, options, call } of this.configurations) {
            registry.add(type, call, options);
        }
    }

    public get(token: Token): ConfigureProviderEntry[] {
        const results: ConfigureProviderEntry[] = [];
        for (const configure of this.configurations) {
            const lookup = isClass(token) ? resolveReceiveType(token) : token;
            if (isType(lookup) && dependencyLookupMatcher(configure.type, lookup)) {
                results.push(configure);
            }
        }
        return results;
    }
}

let moduleIds: number = 0;

export interface PreparedProvider {
    token: Token;

    /**
     * The modules from which dependencies can be resolved. The first item is always the module from which this provider was declared.
     *
     * This is per default the module in which the provider was declared,
     * but if the provider was moved (by exporting), then if
     *   a) the parent had this provider already, then this array has additionally the one from which the provider was exported.
     *   b) the parent had no provider of that token, then this array is just the module from which the provider was exported.
     *
     * This is important otherwise exported provider won't have access in their dependencies to their original (encapsulated) injector.
     */
    modules: InjectorModule[];

    /**
     * A token can have multiple providers, for each scope its own entry.
     * Each scoped provider can only exist once.
     */
    providers: NormalizedProvider[];

    /**
     * When this provider was exported to another module and thus is actually instantiated in another module, then this is set.
     * This is necessary to tell the module who declared this provider to not instantiate it, but redirects resolve requests
     * to `resolveFrom` instead.
     */
    resolveFrom?: InjectorModule;
}

/**
 * 0 means not compatible, 1 means exactly compatible, n>1 means compatible but not exactly. The higher the number the further away the compatibility is (the inheritance chain).
 */
function getSpecificity(a: Type, b: Type): number {
    return nominalCompatibility(a, b);
}

// A token's type, computed once: the provider lookups ask for every provider's token type on every lookup
const objectTokenTypes = new WeakMap<object, Type>();
const valueTokenTypes = new Map<unknown, Type>();

function getTypeFromToken(token: Token): Type {
    const cache: { get(key: any): Type | undefined, set(key: any, value: Type): unknown } =
        (typeof token === 'object' && token !== null) || typeof token === 'function' ? objectTokenTypes : valueTokenTypes;
    let type = cache.get(token);
    if (type === undefined) {
        type = isClass(token) && hasTypeInformation(token) ? reflect(token) : isType(token) ? token : typeInfer(token);
        cache.set(token, type);
    }
    return type;
}

function getTypeFromProvider(preparedProvider: PreparedProvider): Type {
    return getTypeFromToken(preparedProvider.token);
}

type LookupMatcher = (token: Type, provider: Type, candidate?: Type) => boolean;

function exportLookupMatcher(token: Type, provider: Type, candidate?: Type): boolean {
    if (token.id) return token.id === provider.id;

    if (token.kind === ReflectionKind.function && provider.kind === ReflectionKind.function && provider.function && provider.function === token.function) return true;
    if (token.kind === ReflectionKind.class && provider.kind === ReflectionKind.class && provider.classType && provider.classType === token.classType) return true;
    if (token.kind === ReflectionKind.literal && provider.kind === ReflectionKind.literal && provider.literal === token.literal) return true;
    return false;
}

function dependencyLookupMatcher(token: Type, provider: Type, candidate?: Type): boolean {
    if (token.id && token.id === provider.id) return true;

    const spec = getSpecificity(token, provider);
    if (!spec) return false;

    if (candidate) {
        //if we have already a matching old candidate, we check if the old candidate was more specific than the new one.
        //if the old one was more specific, we don't want to replace it. (lower number means more specific)
        const oldSpec = getSpecificity(token, candidate);
        if (oldSpec <= spec) return false;
    }

    return true;
}

function lookupPreparedProviders(
    preparedProviders: PreparedProvider[],
    token: Token | PreparedProvider,
    matcher: LookupMatcher,
    candidate?: PreparedProvider,
): PreparedProvider | undefined {
    const tokenProvider: any | undefined = (isPlainObject(token) && 'provide' in token && !('kind' in token)) ? token : undefined;
    const tokenType = tokenProvider ? undefined : getTypeFromToken(token);

    for (const preparedProvider of preparedProviders) {
        if (tokenProvider) {
            //token is a PreparedProvider, which matches only by identity
            if (preparedProvider === tokenProvider || preparedProvider.providers.includes(tokenProvider)) return preparedProvider;
            continue;
        }
        if (!tokenType) continue;

        const preparedProviderType = getTypeFromToken(preparedProvider.token);

        if (matcher(tokenType, preparedProviderType, candidate ? getTypeFromProvider(candidate) : undefined)) {
            candidate = preparedProvider;
        }
    }

    return candidate;
}

function registerPreparedProvider(preparedProviders: PreparedProvider[], modules: InjectorModule[], providers: NormalizedProvider[], replaceExistingScope: boolean = true) {
    const token = providers[0].provide;
    if (token === undefined) {
        throw new Error('token is undefined: ' + JSON.stringify(providers));
    }

    const preparedProvider = lookupPreparedProviders(preparedProviders, token, exportLookupMatcher);
    if (preparedProvider) {
        preparedProvider.token = token;
        for (const m of modules) {
            if (preparedProvider.modules.includes(m)) continue;
            preparedProvider.modules.push(m);
        }
        for (const provider of providers) {
            const scope = getScope(provider);
            //check if given provider has an unknown scope, if so set it.
            //if the scope is known, overwrite it (we want always the last known provider to be valid)
            const knownProvider = preparedProvider.providers.findIndex(v => getScope(v) === scope);
            if (knownProvider === -1) {
                //scope not known, add it
                preparedProvider.providers.push(provider);
            } else if (replaceExistingScope) {
                //scope already known, replace it
                preparedProvider.providers.splice(knownProvider, 1, provider);
            }
        }
    } else {
        //just add it
        preparedProviders.push({ token, modules, providers: providers.slice() });
    }
}

// Where a config type is in another one, found once per pair: config types don't change, and the injector looks
// them up for every provider that reads config
const childOfConfigCache = new WeakMap<ClassType, Map<TypeClass | TypeObjectLiteral, string | undefined>>();

function isInChildOfConfig(findType: TypeClass | TypeObjectLiteral, inType?: ClassType): string | undefined {
    if (!inType) return;
    let byFindType = childOfConfigCache.get(inType);
    if (!byFindType) childOfConfigCache.set(inType, byFindType = new Map());
    if (byFindType.has(findType)) return byFindType.get(findType);
    const found = findInChildOfConfig(findType, inType);
    byFindType.set(findType, found);
    return found;
}

function findInChildOfConfig(findType: TypeClass | TypeObjectLiteral, inType: ClassType): string | undefined {
    const inTypeType = reflect(inType);
    if (inTypeType.kind !== ReflectionKind.class && inTypeType.kind !== ReflectionKind.objectLiteral) return;

    let found: string | undefined = undefined;
    visit(inTypeType, (type, path): false | void => {
        if (type === findType) {
            found = path;
            return false;
        } else if (type.kind === ReflectionKind.class && findType.kind === ReflectionKind.class && type.classType === findType.classType) {
            found = path;
            return false;
        }
    });

    return found;
}

export function findModuleForConfig(config: ClassType, modules: InjectorModule[]): { module: InjectorModule, path: string } | undefined {
    //go first through first level tree, then second, the third, etc., until no left
    const next: InjectorModule[] = modules.slice();

    const configType = reflectOrUndefined(config);
    if (!configType) return;

    if (configType.kind !== ReflectionKind.class && configType.kind !== ReflectionKind.objectLiteral) return;

    while (next.length) {
        const iterateOver: InjectorModule[] = next.slice();
        next.length = 0;

        for (const m of iterateOver) {
            if (m.configDefinition === config) return { module: m, path: '' };
            const foundInChild = isInChildOfConfig(configType, m.configDefinition);
            if (foundInChild) return { module: m, path: foundInChild };

            let parent = m.parent;
            while (parent) {
                if (parent.configDefinition === config) return { module: parent, path: '' };
                const foundInChild = isInChildOfConfig(configType, parent.configDefinition);
                if (foundInChild) return { module: parent, path: foundInChild };
                parent = parent.parent;
            }
            next.push(...m.imports);
        }
    }

    return undefined;
}

export type ExportType = Token | InjectorModule;


export function isProvided<T>(providers: ProviderWithScope[], token: Token<T>): boolean {
    return providers.some(v => getContainerToken(resolveToken(v)) === getContainerToken(token));
}

export function getScope(provider: ProviderWithScope): string {
    return (isClass(provider) ? '' : provider instanceof TagProvider ? provider.provider.scope : provider.scope) || '';
}

export type InjectorModuleConfig = { [name: string]: any } | undefined;

type RemovedUndefined<T> = T extends undefined ? never : T;

/**
 * @reflection never
 */
export class InjectorModule<C extends InjectorModuleConfig = any> {
    public id: number = moduleIds++;

    /**
     * Whether this module is for the root module. All its providers are automatically exported and moved to the root level.
     */
    public root: boolean = false;

    /**
     * The built injector. This is set once an Injector for this module has been created.
     */
    injector?: Injector;

    public configurationProviderRegistry: ConfigurationProviderRegistry = new ConfigurationProviderRegistry;
    public globalConfigurationProviderRegistry: ConfigurationProviderRegistry = new ConfigurationProviderRegistry;

    imports: InjectorModule[] = [];

    protected exportsDisabled: boolean = false;

    public configDefinition?: ClassType;

    constructor(
        public providers: ProviderWithScope[] = [],
        public parent?: InjectorModule,
        public config: RemovedUndefined<C> = {} as RemovedUndefined<C>,
        public exports: ExportType[] = [],
    ) {
        if (this.parent) this.parent.registerAsChildren(this);
    }

    registerAsChildren(child: InjectorModule): void {
        if (this.imports.includes(child)) return;
        this.imports.push(child);
    }

    /**
     * When the module exports providers the importer doesn't want, then `disableExports` disable all exports.
     */
    disableExports(): this {
        this.exportsDisabled = true;
        return this;
    }

    /**
     * Makes all the providers, controllers, etc available at the root module, basically exporting everything.
     */
    forRoot(): this {
        this.root = true;
        return this;
    }

    /**
     * Reverts the root default setting to false.
     */
    notForRoot(): this {
        this.root = false;
        return this;
    }

    unregisterAsChildren(child: InjectorModule): void {
        if (!this.imports.includes(child)) return;
        child.parent = undefined;
        arrayRemoveItem(this.imports, child);
    }

    getChildren(): InjectorModule[] {
        return this.imports;
    }

    setConfigDefinition(config: ClassType): this {
        this.configDefinition = config;
        const configDefaults = new config;
        this.config = Object.assign(configDefaults, this.config);
        return this;
    }

    setParent(parent: InjectorModule): this {
        if (this.parent === parent) return this;
        this.assertInjectorNotBuilt();
        if (this.parent) this.parent.unregisterAsChildren(this);
        this.parent = parent;
        this.parent.registerAsChildren(this);
        return this;
    }

    getParent(): InjectorModule | undefined {
        return this.parent;
    }

    protected assertInjectorNotBuilt(): void {
        if (!this.injector) return;
        throw new Error(`Injector already built for ${getClassName(this)}. Can not modify its provider or tree structure.`);
    }

    addExport(...types: (ExportType | ExportType[])[]): this {
        this.assertInjectorNotBuilt();
        this.exports.push(...types.flat());
        return this;
    }

    isExported(token: Token): boolean {
        return this.exports.includes(token);
    }

    isProvided<T>(token?: Token<T>, type?: ReceiveType<T>): boolean {
        if (!token) {
            token = resolveReceiveType(type);
        }
        return isProvided<T>(this.getProviders(), token);
    }

    addProvider(...provider: (ProviderWithScope | ProviderWithScope[])[]): this {
        this.assertInjectorNotBuilt();
        this.providers.push(...provider.flat());
        return this;
    }

    getProviders(): ProviderWithScope[] {
        return this.providers;
    }

    getConfig(): C {
        return this.config;
    }

    configure(config: Partial<C>): this {
        Object.assign(this.config, config);
        return this;
    }

    getImports(): InjectorModule[] {
        return this.imports;
    }

    getImportedModulesByClass<T extends InjectorModule>(classType: ClassType<T>): T[] {
        return this.getImports().filter(v => v instanceof classType) as T[];
    }

    getImportedModuleByClass<T extends InjectorModule>(classType: ClassType<T>): T {
        const v = this.getImports().find(v => v instanceof classType);
        if (!v) {
            throw new Error(`No module ${getClassName(classType)} in ${getClassName(this)}#${this.id} imported.`);
        }
        return v as T;
    }

    getImportedModule<T extends InjectorModule>(module: T): T {
        const v = this.getImports().find(v => v.id === module.id);
        if (!v) {
            throw new Error(`No module ${getClassName(module)}#${module.id} in ${getClassName(this)}#${this.id} imported.`);
        }
        return v as T;
    }

    getExports() {
        return this.exports;
    }

    hasImport<T extends InjectorModule>(moduleClass: ClassType<T>): boolean {
        for (const importModule of this.getImports()) {
            if (importModule instanceof moduleClass) return true;
        }
        return false;
    }

    /**
     * Adds a new import at the end.
     */
    addImport(...modules: InjectorModule<any>[]): this {
        this.assertInjectorNotBuilt();
        for (const module of modules) {
            module.setParent(this);
        }
        return this;
    }

    /**
     * Adds a new import at the beginning. Since import order matters, it might be useful to import a module first
     * so its exported providers can be overwritten by imports following this module.
     */
    addImportAtBeginning(...modules: InjectorModule<any>[]): this {
        this.assertInjectorNotBuilt();
        for (const module of modules) {
            module.parent = this;
            this.imports.unshift(module);
        }
        return this;
    }

    /**
     * Configures a provider by applying a custom configuration function to its instance.
     * The passed configure function is executed when instance was created.
     * If the provider is in a scope and the scope created multiple instances,
     * the configure function is executed for each instance.
     *
     * The purpose of a provider configuration is to configure the instance, for example
     * call methods on it, set properties, etc.
     *
     * The first parameter of the function is always the instance of the provider that was created.
     * All additional defined parameters will be provided by the dependency injection container.
     *
     * if `options.replace` is true, the returned value of `configure` will
     * replace the instance.
     * if `options.global` is true, the configuration function is applied to all
     * providers in the whole module tree.
     * The `options.order` defines the order of execution of the configuration function.
     * The lower the number, the earlier it is executed.
     */
    configureProvider<T>(configure: (instance: T, ...args: any[]) => any, options: Partial<ConfigureProviderOptions> = {}, type?: ReceiveType<T>): this {
        const optionsResolved = Object.assign({ order: 0, replace: false, global: false }, options);
        type = resolveReceiveType(type);
        const registry = options.global ? this.globalConfigurationProviderRegistry : this.configurationProviderRegistry;
        registry.add(type, configure, optionsResolved);
        return this;
    }

    getOrCreateInjector(buildContext?: BuildContext): Injector {
        if (this.injector) return this.injector;

        buildContext ||= new BuildContext;

        //notify everyone we know to prepare providers
        if (this.parent) this.parent.getPreparedProviders(buildContext);
        this.getPreparedProviders(buildContext);

        //handle exports, from bottom to up
        if (this.parent) this.parent.handleExports(buildContext);
        this.handleExports(buildContext);

        //build the injector context
        if (this.parent) this.parent.getOrCreateInjector(buildContext);
        this.injector = new Injector(this, buildContext);
        for (const child of this.imports) child.getOrCreateInjector(buildContext);

        return this.injector;
    }

    protected preparedProviders?: PreparedProvider[];

    getPreparedProvider(token: Token, candidate?: PreparedProvider): PreparedProvider | undefined {
        if (!this.preparedProviders) return;
        return lookupPreparedProviders(this.preparedProviders, token, dependencyLookupMatcher, candidate);
    }

    getSetupProvider(token: Token, candidate?: PreparedProvider): PreparedProvider | undefined {
        if (!this.preparedProviders) return;
        return lookupPreparedProviders(this.preparedProviders, token, exportLookupMatcher, candidate);
    }

    resolveToken(token: Token): InjectorModule | undefined {
        const found = this.getPreparedProvider(token);
        if (found) return this;
        if (this.parent) return this.parent.resolveToken(token);
        return;
    }

    getBuiltPreparedProviders(): PreparedProvider[] | undefined {
        return this.preparedProviders;
    }

    /**
     * Prepared the module for an injector tree build.
     *
     *  - Index providers by token so that last known provider is picked (so they can be overwritten).
     *  - Register TagProvider in TagRegistry
     *  - Put TagProvider in providers if not already made.
     *  - Put exports to parent's module with the reference to this, so the dependencies are fetched from the correct module.
     */
    getPreparedProviders(buildContext: BuildContext): PreparedProvider[] {
        if (this.preparedProviders) return this.preparedProviders;

        for (const m of this.imports) {
            m.getPreparedProviders(buildContext);
        }

        this.preparedProviders = [];

        this.globalConfigurationProviderRegistry.mergeInto(buildContext.globalConfigurationProviderRegistry);

        //make sure that providers that declare the same provider token will be filtered out so that the last will be used.
        for (const provider of this.providers) {
            if (!provider) continue;
            if (provider instanceof TagProvider) {
                buildContext.tagRegistry.register(provider, this);

                if (!lookupPreparedProviders(this.preparedProviders, provider.provider.provide, exportLookupMatcher)) {
                    //we don't want to overwrite that provider with a tag
                    registerPreparedProvider(this.preparedProviders, [this], [provider.provider]);
                }
            } else if (isClass(provider)) {
                registerPreparedProvider(this.preparedProviders, [this], [{ provide: provider }]);
            } else if (isPlainObject(provider)) {
                registerPreparedProvider(this.preparedProviders, [this], [provider]);
            }
        }

        return this.preparedProviders;
    }

    protected exported: boolean = false;

    protected handleExports(buildContext: BuildContext) {
        if (this.exported) return;
        this.exported = true;

        //the import order is important. the last entry is the most important and should be able to overwrite
        //previous modules. In order to make that work, we call handleExports in reversed order.
        //this lets providers from the last import register their provider first, and make them available first
        //in the injector (which equals to be resolved first).
        for (let i = this.imports.length - 1; i >= 0; i--) {
            this.imports[i].setParent(this);
            this.imports[i].handleExports(buildContext);
        }
        // for (const m of this.imports) {
        //     m.setParent(this);
        //     m.handleExports(buildContext);
        // }

        if (!this.preparedProviders) return;
        if (!this.parent) return;
        if (this.exportsDisabled) return;

        const exportToken = (token: ExportType, to: InjectorModule) => {
            if (!this.preparedProviders) return;

            const preparedProvider = lookupPreparedProviders(this.preparedProviders, token, exportLookupMatcher);
            //if it was not in provider, we continue
            if (!preparedProvider) return;

            //mark this provider as redirect to `exportTo`
            preparedProvider.resolveFrom = to;

            const parentProviders = to.getPreparedProviders(buildContext);
            const parentProvider = lookupPreparedProviders(parentProviders, token, exportLookupMatcher);
            //if the parent has this token already defined, we just switch its module to ours,
            //so it's able to inject our encapsulated services.
            if (parentProvider) {
                //we add our module as additional source for potential dependencies
                registerPreparedProvider(parentProviders, preparedProvider.modules, preparedProvider.providers, false);
            } else {
                // [this, to] is used so that this service resolves dependencies from the target first (so it can overwrite them)
                // and falls back to the module it was defined in. This includes configureProvider() calls.
                parentProviders.push({ token: preparedProvider.token, modules: [to, this], providers: preparedProvider.providers.slice() });
            }
        };

        if (this.root) {
            if (this.exports.length !== 0) {
                throw new Error(`Can not use forRoot and exports at the same time in module ${this.constructor.name}. Either you want to export everything to the root (via forRoot: true), or export a subset to the parent (via exports)`);
            }

            const root = this.findRoot();
            if (root !== this) {
                for (const prepared of this.preparedProviders) {
                    exportToken(prepared.token, root);
                }
            }
        } else {
            for (const entry of this.exports) {
                if ((isClass(entry) && isPrototypeOfBase(entry, InjectorModule)) || entry instanceof InjectorModule) {
                    const moduleInstance = isClass(entry) ? this.imports.find(v => v instanceof entry) : entry;
                    if (!moduleInstance) {
                        throw new Error(`Unknown module ${getClassName(entry)} exported from ${getClassName(this)}. The module was never imported.`);
                    }

                    //export everything to the parent that we received from that `entry` module
                    for (const preparedProvider of this.preparedProviders) {
                        if (preparedProvider.modules.includes(moduleInstance)) {
                            //this provider was received from `entry`

                            //mark this provider as redirect to `exportTo`
                            preparedProvider.resolveFrom = this.parent;

                            const parentProviders = this.parent.getPreparedProviders(buildContext);
                            const parentProvider = lookupPreparedProviders(parentProviders, preparedProvider.token, exportLookupMatcher);
                            //if the parent has this token already defined, we just switch its module to ours,
                            //so it's able to inject our encapsulated services.
                            if (parentProvider) {
                                //we add our module as additional source for potential dependencies
                                registerPreparedProvider(parentProviders, preparedProvider.modules, preparedProvider.providers, false);
                            } else {
                                parentProviders.push({
                                    token: preparedProvider.token,
                                    modules: [this, ...preparedProvider.modules],
                                    providers: preparedProvider.providers.slice(),
                                });
                            }
                        }
                    }
                } else {
                    //export single token
                    exportToken(entry, this.parent);
                }
            }
        }
    }

    findRoot(): InjectorModule {
        if (this.parent) return this.parent.findRoot();
        return this;
    }
}
