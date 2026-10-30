import {
    deserialize,
    Excluded,
    ReflectionClass,
    ReflectionKind,
    resolveTypeMembers,
    serialize,
    Serializer,
    Type,
    typeAnnotation,
    TypeClass,
} from '@deepkit/type';
import {
    ClassType,
    getClassTypeFromInstance,
    getPathValue,
    setPathValue,
    throttleTime,
    TypeAnnotation,
} from '@deepkit/core';
import { EventToken } from '@deepkit/event';
import { ApplicationRef, Injector } from '@angular/core';
import { NavigationEnd, ResolveEnd, Router } from '@angular/router';

/**
 * If this type decorator is used then the property is not persisted in localStorage,
 * but in the URL instead and recovered from the URL when reloaded.
 *
 * @example
 * ```typescript
 * class State extends EfficientState {
 *    shop: number & PartOfUrl = 0;
 * }
 * ```
 */
export type PartOfUrl = TypeAnnotation<'partOfUrl'>;

export type FilterActions<T> = { [name in keyof T]: T[name] extends (a: infer A extends [...a: any[]], ...args: any[]) => infer R ? (...args: A) => R : never };

/**
 * EfficientState is a base class for all states that are used in the frontend.
 *
 * @example
 * ```typescript
 * //state that won't be persisted is used as `VolatileState & Excluded`
 * class VolatileState {
 *     shops: Shop[] = [];
 *
 *     user?: User;
 * }
 *
 * export class State extends EfficientState {
 *     shop: number & PartOfUrl = 0;
 *     sidebarVisible: boolean = true;
 *     searchQuery: string = '';
 *
 *     volatile: VolatileState & Excluded = new VolatileState();
 *
 *     //normal methods are supported
 *     getShop(): Shop | undefined {
 *         return this.volatile.getShop(this.shop);
 *     }
 *
 *     //actions have access to Angular's DI container
 *     async authenticated([user]: [FrontendUser], client: ControllerClient) {
 *         this.volatile.shops = await client.shop.getShops();
 *         this.volatile.user = user;
 *     }
 * }
 * ```
 */
export class EfficientState {
    call: FilterActions<this> & Excluded;

    constructor(injector?: Injector) {
        this.call = {} as any;
        if (!injector) return;
        const app = injector.get(ApplicationRef);

        for (const method of ReflectionClass.from(this.constructor as any).getMethods()) {
            if (method.name === 'constructor') continue;
            const params = method.getParameters().slice(1).map(v => v.type).filter(v => v.kind === ReflectionKind.class) as TypeClass[];
            (this.call as any)[method.name] = (...args: any[]) => {
                const deps: any = params.map(v => injector.get(v.classType));
                const res = (this as any)[method.name](args, ...deps);
                if (res instanceof Promise) {
                    return res.finally(() => app.tick());
                }
                return res;
            };
        }
    }
}

function isBuiltinWithMutableMethods(value: object): boolean {
    return value instanceof Date || value instanceof Set || value instanceof Map
        || value instanceof WeakSet || value instanceof WeakMap || ArrayBuffer.isView(value);
}

function isMutatingMethod(target: object, name: string): boolean {
    if (target instanceof Date) return name.startsWith('set');
    if (target instanceof Map || target instanceof WeakMap) return name === 'set' || name === 'delete' || name === 'clear';
    if (target instanceof Set || target instanceof WeakSet) return name === 'add' || name === 'delete' || name === 'clear';
    return name === 'set' || name === 'fill' || name === 'copyWithin' || name === 'reverse' || name === 'sort';
}

/**
 * Returns a deep proxy of the given object that calls onChange whenever something in it is changed
 * (property set/delete/define on objects and arrays, and mutating methods of Date, Map, Set, and typed arrays).
 *
 * Properties named in ignoreKeys are neither observed nor reported, at any depth.
 */
export function observeChanges<T extends object>(object: T, onChange: () => void, ignoreKeys: (string | symbol)[] = []): T {
    const proxies = new WeakMap<object, any>();
    const targets = new WeakMap<object, object>();

    function isGetInvariant(target: object, property: string | symbol): boolean {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        return descriptor !== undefined && descriptor.configurable !== true && descriptor.writable !== true;
    }

    function observe(value: any): any {
        if (value === null || typeof value !== 'object' || value instanceof RegExp) return value;
        let proxy = proxies.get(value);
        if (proxy) return proxy;

        proxy = new Proxy(value, isBuiltinWithMutableMethods(value) ? builtinHandler : handler);
        proxies.set(value, proxy);
        targets.set(proxy, value);
        return proxy;
    }

    const handler: ProxyHandler<any> = {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property === 'symbol' || property === 'constructor' || ignoreKeys.includes(property)) return value;
            if (isGetInvariant(target, property)) return value;
            return observe(value);
        },
        set(target, property, value) {
            value = targets.get(value) || value;
            if (Object.is(target[property], value) && property in target) return true;
            const result = Reflect.set(target, property, value);
            if (result && !ignoreKeys.includes(property)) onChange();
            return result;
        },
        defineProperty(target, property, descriptor) {
            const result = Reflect.defineProperty(target, property, descriptor);
            if (result && !ignoreKeys.includes(property)) onChange();
            return result;
        },
        deleteProperty(target, property) {
            if (!Reflect.has(target, property)) return true;
            const result = Reflect.deleteProperty(target, property);
            if (result && !ignoreKeys.includes(property)) onChange();
            return result;
        },
    };

    // methods of built-ins only work with the original object as `this`
    const builtinHandler: ProxyHandler<any> = {
        ...handler,
        get(target, property) {
            const value = Reflect.get(target, property);
            if (typeof value !== 'function') return value;
            return (...args: any[]) => {
                const result = value.apply(target, args);
                if (typeof property === 'string' && isMutatingMethod(target, property)) onChange();
                return target instanceof Map && property === 'get' ? observe(result) : result;
            };
        },
    };

    return observe(object);
}

export function findPartsOfUrl(stateClass: ClassType) {
    const paths: string[] = [];
    const schema = ReflectionClass.from(stateClass);
    findPartsOfUrlForType(schema.type, paths);
    return paths;
}

export function getQueryObject(state: EfficientState) {
    const query: any = {};
    const paths = findPartsOfUrl(getClassTypeFromInstance(state));
    for (const path of paths) {
        const value = getPathValue(state, path);
        if (value !== undefined) query[path] = value;
    }
    return query;
}

export function findPartsOfUrlForType(type: Type, paths: string[] = [], prefix: string = '', state: any[] = []) {
    if (state.includes(type)) return;
    state.push(type);
    if (type.kind === ReflectionKind.class || type.kind === ReflectionKind.objectLiteral) {
        for (const property of resolveTypeMembers(type)) {
            if (property.kind !== ReflectionKind.property && property.kind !== ReflectionKind.propertySignature) continue;
            if (property.type.kind === ReflectionKind.class || property.type.kind === ReflectionKind.objectLiteral) {
                findPartsOfUrlForType(property.type, paths, (prefix ? prefix + '.' : '') + String(property.name), state);
            } else {
                const meta = typeAnnotation.getType(property.type, 'partOfUrl');
                if (meta) {
                    paths.push((prefix ? prefix + '.' : '') + String(property.name));
                }
            }
        }
    }
}

const stateSerializer: Serializer = new class extends Serializer {
    protected registerSerializers() {
        super.registerSerializers();

        this.serializeRegistry.registerClass(EventToken, (type, state) => {
            state.template = ''; //don't serialize EventToken
        });

        this.deserializeRegistry.registerClass(EventToken, (type, state) => {
            state.template = ''; //don't serialize EventToken
        });
    }
};

/**
 * Angular provider factory for the state class.
 *
 * @example
 * ```typescript
 *
 * @Injectable()
 * export class State extends EfficientState {
 *    //events
 *    fileAdded = new EventToken('file.added');
 *
 *    //persisted state
 *    shop: number = 0;
 *    sidebarVisible: boolean = true;
 * }
 *
 * @NgModule({
 *     providers: [
 *         provideState(State),
 *     ]
 * })
 * class AppModule {}
 * ```
 */
export function provideState(stateClass: ClassType, localStorageKey: string = 'appState') {
    const stateType = ReflectionClass.from(stateClass).type;

    return {
        provide: stateClass, deps: [Router, Injector], useFactory: (router: Router, injector: Injector) => {
            let state = new stateClass(injector);
            try {
                const nextState: any = deserialize(JSON.parse(localStorage.getItem(localStorageKey) || ''), undefined, stateSerializer, undefined, stateType);
                if (nextState) {
                    delete nextState.call;
                    Object.assign(state, nextState);
                }
            } catch (error) {
            }

            function loadFromRoute(query: object) {
                // console.log('loadFromRoute', query);
                for (const [path, value] of Object.entries(query)) {
                    setPathValue(state, path, value);
                }
            }

            function updateQueries() {
                const queryParams = getQueryObject(state);
                const current = router.routerState.snapshot.root.queryParams;
                //check if different
                let different = false;
                for (const [key, value] of Object.entries(queryParams)) {
                    if (current[key] !== value) {
                        different = true;
                        break;
                    }
                }
                if (different) {
                    router.navigate([], { queryParams: queryParams, queryParamsHandling: 'merge', replaceUrl: true });
                }
            }

            const updateStorage = throttleTime(() => {
                localStorage.setItem(localStorageKey, JSON.stringify(serialize(state, undefined, stateSerializer, undefined, stateType)));
                updateQueries();
            });

            router.events.subscribe((event) => {
                // console.log('event', event);
                if (event instanceof ResolveEnd) {
                    loadFromRoute(event.state.root.queryParams);
                }
                if (event instanceof NavigationEnd) {
                    updateQueries();
                }
            });

            return observeChanges(state, updateStorage, ['call', 'volatile']);
        }
    };
}
