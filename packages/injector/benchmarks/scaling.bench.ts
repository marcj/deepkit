/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BenchSuite } from '@deepkit/bench';
import { Injector, InjectorContext, InjectorModule, Tag, TagProvider } from '@deepkit/injector';

/**
 * Injector Scaling Benchmark Suite
 *
 * Tests how the injector performs as the number of providers increases
 * and under various complexity scenarios:
 *
 * 1. Provider table scaling - 10, 50, 100, 200, 500 providers
 * 2. Dependency chain depths - 1, 3, 5, 10 level dependency chains
 * 3. Scoped vs singleton resolution comparison
 * 4. Tag-based injection - resolving by Tag<T>
 * 5. Transient providers - new instance each time
 * 6. Resolver caching - getResolver() vs direct get()
 */

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS TO GENERATE PROVIDERS DYNAMICALLY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates N provider classes with no dependencies
 */
function createSimpleProviders(count: number): any[] {
    const providers: any[] = [];
    for (let i = 0; i < count; i++) {
        // Use eval to create unique class names for better debugging
        const Provider = new Function(`return class Provider${i} { value = ${i}; }`)();
        providers.push(Provider);
    }
    return providers;
}

/**
 * Creates a chain of providers where each depends on the previous one
 * Returns [RootClass, ...MiddleClasses, LeafClass]
 */
function createDependencyChain(depth: number): { providers: any[]; root: any; leaf: any } {
    if (depth < 1) throw new Error('Depth must be at least 1');

    const providers: any[] = [];

    // Create the leaf (no dependencies)
    const LeafClass = new Function(`return class ChainLeaf { depth = ${depth}; }`)();
    providers.push(LeafClass);

    let previousClass = LeafClass;

    // Create intermediate classes (each depends on the previous)
    for (let i = depth - 1; i > 0; i--) {
        const CurrentClass = new Function(
            'Dep',
            `return class ChainLevel${i} {
                constructor(dep) { this.dep = dep; }
                depth = ${i};
            }`,
        )(previousClass);

        // We need to use the factory pattern to inject dependencies
        providers.push({
            provide: CurrentClass,
            useFactory: (dep: any) => new CurrentClass(dep),
        });

        previousClass = CurrentClass;
    }

    return {
        providers: providers.reverse(),
        root: previousClass,
        leaf: LeafClass,
    };
}

/**
 * Creates a dependency chain using proper class constructors for DI
 */
function createDependencyChainClasses(depth: number): { classes: any[]; root: any; leaf: any } {
    const classes: any[] = [];

    // Build from leaf to root
    // Leaf class - no dependencies
    class ChainLeaf {
        depth = depth;
    }
    classes.push(ChainLeaf);

    if (depth === 1) {
        return { classes, root: ChainLeaf, leaf: ChainLeaf };
    }

    // For depth > 1, we need intermediate classes
    // Due to TypeScript/runtime type requirements, we'll create factory providers
    let previousClass: any = ChainLeaf;

    for (let i = depth - 1; i >= 1; i--) {
        const level = i;
        const DepClass = previousClass;

        // Create a new class that depends on the previous
        const CurrentClass = class {
            dep: any;
            depth = level;
            constructor(dep: any) {
                this.dep = dep;
            }
        };
        Object.defineProperty(CurrentClass, 'name', { value: `ChainLevel${level}` });

        classes.push({ provide: CurrentClass, useFactory: (d: typeof DepClass) => new CurrentClass(d) });
        previousClass = CurrentClass;
    }

    return {
        classes: classes.reverse(),
        root: previousClass,
        leaf: ChainLeaf,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG DEFINITIONS FOR TAG-BASED INJECTION
// ═══════════════════════════════════════════════════════════════════════════

class LoggerTag extends Tag<Logger> {}

interface Logger {
    log(message: string): void;
}

class ConsoleLogger implements Logger {
    log(message: string): void {}
}

class FileLogger implements Logger {
    log(message: string): void {}
}

class MetricsLogger implements Logger {
    log(message: string): void {}
}

// ═══════════════════════════════════════════════════════════════════════════
// BENCHMARK SUITE
// ═══════════════════════════════════════════════════════════════════════════

export default async function () {
    const suite = new BenchSuite('injector/scaling');

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. PROVIDER TABLE SCALING
    // Tests how resolution time changes as provider count increases
    // ═══════════════════════════════════════════════════════════════════════════

    const providerCounts = [10, 50, 100, 200, 500];

    for (const count of providerCounts) {
        const providers = createSimpleProviders(count);
        const module = new InjectorModule(providers);
        const context = new InjectorContext(module);
        const injector = context.getInjector(module);

        // Target: resolve the last provider (worst case - linear scan)
        const targetClass = providers[providers.length - 1];

        // Warmup
        for (let i = 0; i < 10_000; i++) {
            injector.get(targetClass);
        }

        // Verify
        const instance = injector.get(targetClass);
        if (instance.value !== count - 1) {
            throw new Error(`Provider resolution failed for count ${count}`);
        }

        suite.add(`${count} providers: get()`, () => {
            injector.get(targetClass);
        });

        // Also test with resolver
        const resolver = injector.getResolver(targetClass);

        suite.add(`${count} providers: resolver()`, () => {
            resolver();
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. DEPENDENCY CHAIN DEPTHS
    // Tests how resolution time scales with dependency depth
    // ═══════════════════════════════════════════════════════════════════════════

    const chainDepths = [1, 3, 5, 10];

    for (const depth of chainDepths) {
        // Create chain classes manually for proper DI
        const chainProviders: any[] = [];

        // Depth 1: single class
        class Depth1Leaf {
            value = 1;
        }

        if (depth === 1) {
            chainProviders.push(Depth1Leaf);
            const module = new InjectorModule(chainProviders);
            const context = new InjectorContext(module);
            const injector = context.getInjector(module);

            // Warmup
            for (let i = 0; i < 10_000; i++) {
                injector.get(Depth1Leaf);
            }

            suite.add(`chain depth ${depth}: get()`, () => {
                injector.get(Depth1Leaf);
            });
        } else {
            // For deeper chains, create with factory providers
            // Build chain from leaf to root

            // Leaf
            class Leaf {
                depth = depth;
            }
            chainProviders.push(Leaf);

            let PrevClass: any = Leaf;

            for (let i = depth - 1; i >= 1; i--) {
                const CurrentDepClass = PrevClass;
                const currentDepth = i;

                class ChainNode {
                    depth = currentDepth;
                    constructor(public dep: any) {}
                }
                Object.defineProperty(ChainNode, 'name', { value: `Chain${depth}_Level${i}` });

                chainProviders.push({
                    provide: ChainNode,
                    useFactory: (d: typeof CurrentDepClass) => new ChainNode(d),
                });

                PrevClass = ChainNode;
            }

            const RootClass = PrevClass;

            const module = new InjectorModule(chainProviders);
            const context = new InjectorContext(module);
            const injector = context.getInjector(module);

            // Warmup
            for (let i = 0; i < 10_000; i++) {
                injector.get(RootClass);
            }

            // Verify chain
            const root = injector.get(RootClass);
            if (root.depth !== 1) {
                throw new Error(`Chain depth verification failed: expected depth 1, got ${root.depth}`);
            }

            suite.add(`chain depth ${depth}: get()`, () => {
                injector.get(RootClass);
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. SCOPED VS SINGLETON RESOLUTION
    // Compares performance of scoped providers vs singletons
    // ═══════════════════════════════════════════════════════════════════════════

    class SingletonService {
        timestamp = Date.now();
    }

    class ScopedService {
        timestamp = Date.now();
    }

    const scopeModule = new InjectorModule([SingletonService, { provide: ScopedService, scope: 'http' }]);

    const scopeContext = new InjectorContext(scopeModule);
    const scopeInjector = scopeContext.getInjector(scopeModule);

    // Pre-create scoped context
    const httpScope = scopeContext.createChildScope('http');

    // Warmup
    for (let i = 0; i < 10_000; i++) {
        scopeInjector.get(SingletonService);
        httpScope.get(ScopedService, scopeModule);
    }

    // Verify
    if (!(scopeInjector.get(SingletonService) instanceof SingletonService)) {
        throw new Error('Singleton resolution failed');
    }
    if (!(httpScope.get(ScopedService, scopeModule) instanceof ScopedService)) {
        throw new Error('Scoped resolution failed');
    }

    suite.add('singleton: get()', () => {
        scopeInjector.get(SingletonService);
    });

    suite.add('scoped: same scope get()', () => {
        httpScope.get(ScopedService, scopeModule);
    });

    suite.add('scoped: new scope + get()', () => {
        const newScope = scopeContext.createChildScope('http');
        newScope.get(ScopedService, scopeModule);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. TAG-BASED INJECTION
    // Tests resolving multiple services by tag
    // ═══════════════════════════════════════════════════════════════════════════

    const tagModule = new InjectorModule([
        LoggerTag.provide(ConsoleLogger),
        LoggerTag.provide(FileLogger),
        LoggerTag.provide(MetricsLogger),
    ]);

    const tagContext = new InjectorContext(tagModule);
    const tagInjector = tagContext.getInjector(tagModule);

    // Create a service that receives all tagged loggers
    class LoggingService {
        constructor(public loggers: LoggerTag) {}
    }

    const loggingModule = new InjectorModule([
        LoggerTag.provide(ConsoleLogger),
        LoggerTag.provide(FileLogger),
        LoggerTag.provide(MetricsLogger),
        {
            provide: LoggingService,
            useFactory: (loggers: LoggerTag) => new LoggingService(loggers),
        },
    ]);

    const loggingContext = new InjectorContext(loggingModule);
    const loggingInjector = loggingContext.getInjector(loggingModule);

    // Warmup
    for (let i = 0; i < 10_000; i++) {
        loggingInjector.get(LoggingService);
    }

    // Verify
    const loggingService = loggingInjector.get(LoggingService);
    if (!(loggingService instanceof LoggingService)) {
        throw new Error('LoggingService resolution failed');
    }
    if (!loggingService.loggers || loggingService.loggers.services.length !== 3) {
        throw new Error(`Tag injection failed: expected 3 loggers, got ${loggingService.loggers?.services?.length}`);
    }

    suite.add('tag injection: get service with tags', () => {
        loggingInjector.get(LoggingService);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. TRANSIENT PROVIDERS
    // Tests new instance creation on each resolution
    // ═══════════════════════════════════════════════════════════════════════════

    class TransientService {
        id = Math.random();
    }

    class NonTransientService {
        id = Math.random();
    }

    const transientModule = new InjectorModule([{ provide: TransientService, transient: true }, NonTransientService]);

    const transientContext = new InjectorContext(transientModule);
    const transientInjector = transientContext.getInjector(transientModule);

    // Warmup
    for (let i = 0; i < 10_000; i++) {
        transientInjector.get(TransientService);
        transientInjector.get(NonTransientService);
    }

    // Verify transient creates new instances
    const t1 = transientInjector.get(TransientService);
    const t2 = transientInjector.get(TransientService);
    if (t1.id === t2.id) {
        throw new Error('Transient verification failed: same instance returned');
    }

    // Verify non-transient returns same instance
    const nt1 = transientInjector.get(NonTransientService);
    const nt2 = transientInjector.get(NonTransientService);
    if (nt1.id !== nt2.id) {
        throw new Error('Non-transient verification failed: different instances returned');
    }

    suite.add('transient: get() (new instance)', () => {
        transientInjector.get(TransientService);
    });

    suite.add('non-transient: get() (cached)', () => {
        transientInjector.get(NonTransientService);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. RESOLVER CACHING - getResolver() vs direct get()
    // Compares cached resolver function vs get() lookup each time
    // ═══════════════════════════════════════════════════════════════════════════

    class ResolverTestService {
        value = 42;
    }

    // Create module with many providers to make lookup more expensive
    const resolverProviders = createSimpleProviders(200);
    resolverProviders.push(ResolverTestService);

    const resolverModule = new InjectorModule(resolverProviders);
    const resolverContext = new InjectorContext(resolverModule);
    const resolverInjector = resolverContext.getInjector(resolverModule);

    // Get cached resolver
    const cachedResolver = resolverInjector.getResolver(ResolverTestService);

    // Warmup
    for (let i = 0; i < 10_000; i++) {
        resolverInjector.get(ResolverTestService);
        cachedResolver();
    }

    // Verify
    if (resolverInjector.get(ResolverTestService).value !== 42) {
        throw new Error('Resolver test service verification failed');
    }
    if (cachedResolver().value !== 42) {
        throw new Error('Cached resolver verification failed');
    }

    suite.add('resolver caching: direct get()', () => {
        resolverInjector.get(ResolverTestService);
    });

    suite.add('resolver caching: cached resolver()', () => {
        cachedResolver();
    });

    // Also compare context.resolve() pattern
    const contextResolver = resolverContext.resolve(resolverModule, ResolverTestService);

    // Warmup
    for (let i = 0; i < 10_000; i++) {
        contextResolver();
    }

    suite.add('resolver caching: context.resolve()', () => {
        contextResolver();
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // BONUS: INJECTOR CREATION OVERHEAD AT SCALE
    // Tests how long it takes to build injector with many providers
    // ═══════════════════════════════════════════════════════════════════════════

    const smallProviders = createSimpleProviders(10);
    const mediumProviders = createSimpleProviders(100);
    const largeProviders = createSimpleProviders(500);

    suite.add('injector creation: 10 providers', () => {
        const mod = new InjectorModule(smallProviders);
        new InjectorContext(mod).getInjector(mod);
    });

    suite.add('injector creation: 100 providers', () => {
        const mod = new InjectorModule(mediumProviders);
        new InjectorContext(mod).getInjector(mod);
    });

    suite.add('injector creation: 500 providers', () => {
        const mod = new InjectorModule(largeProviders);
        new InjectorContext(mod).getInjector(mod);
    });

    return suite;
}
