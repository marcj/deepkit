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
import { InjectorContext, InjectorModule } from '@deepkit/injector';

/**
 * Comprehensive Dependency Injection benchmark suite
 *
 * Tests:
 * 1. Basic provider resolution (simple, with dependencies)
 * 2. Scoped providers (same scope, new scope)
 * 3. Module-based resolution
 * 4. Injector creation overhead
 * 5. Context and child scope creation
 *
 * Uses 200+ providers to simulate a real-world application.
 */

export default async function () {
    const suite = new BenchSuite('injector/di');

    // ═══════════════════════════════════════════════════════════════════════════
    // SERVICE DEFINITIONS
    // ═══════════════════════════════════════════════════════════════════════════

    class Database {}

    class Repository {
        constructor(public database: Database) {}
    }

    class Service {
        constructor(public repository: Repository) {}
    }

    class ScopedService {}

    // ═══════════════════════════════════════════════════════════════════════════
    // MODULE SETUP (with 200+ providers to simulate real-world app)
    // ═══════════════════════════════════════════════════════════════════════════

    const providers: any[] = [Database, Repository, Service, { provide: ScopedService, scope: 'http' }];

    // Add 200 dummy providers to simulate a real application
    for (let i = 0; i < 200; i++) {
        class DummyService {}
        providers.unshift(DummyService);
    }

    const module = new InjectorModule(providers);
    const context = new InjectorContext(module);
    const injector = context.getInjector(module);

    // Pre-create a scoped context for "same scope" benchmarks
    const scopedContext = context.createChildScope('http');

    // ═══════════════════════════════════════════════════════════════════════════
    // WARMUP (ensure JIT optimization)
    // ═══════════════════════════════════════════════════════════════════════════

    for (let i = 0; i < 100_000; i++) {
        injector.get(Database);
        injector.get(Service);
        scopedContext.get(ScopedService, module);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    if (!(injector.get(Database) instanceof Database)) {
        throw new Error('Database resolution failed');
    }
    if (!(injector.get(Service) instanceof Service)) {
        throw new Error('Service resolution failed');
    }
    if (!(scopedContext.get(ScopedService, module) instanceof ScopedService)) {
        throw new Error('ScopedService resolution failed');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. BASIC PROVIDER RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    // Baseline: raw instantiation without DI
    suite.add('baseline: new Database()', () => {
        new Database();
    });

    // Simple provider (no dependencies)
    suite.add('get simple provider', () => {
        injector.get(Database);
    });

    // Provider with dependency chain (Service -> Repository -> Database)
    suite.add('get provider with dependencies', () => {
        injector.get(Service);
    });

    // Using resolver function directly
    const resolver = context.resolve(module, Database);
    suite.add('get via resolver function', () => {
        resolver();
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. SCOPED PROVIDERS
    // ═══════════════════════════════════════════════════════════════════════════

    // Scoped provider - reusing existing scope (instance cached)
    suite.add('scoped: same scope (cached)', () => {
        scopedContext.get(ScopedService, module);
    });

    // Scoped provider - new scope each time
    suite.add('scoped: new scope each call', () => {
        const newScope = context.createChildScope('http');
        newScope.get(ScopedService, module);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. MODULE-BASED RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════════

    // Get injector from context, then resolve
    suite.add('context.getInjector().get()', () => {
        context.getInjector(module).get(Database);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. INJECTOR CREATION OVERHEAD
    // ═══════════════════════════════════════════════════════════════════════════

    // Measure cost of creating a new InjectorContext
    const freshModule = new InjectorModule([Database]);
    suite.add('new InjectorContext(module)', () => {
        new InjectorContext(freshModule);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. CONTEXT AND CHILD SCOPE CREATION
    // ═══════════════════════════════════════════════════════════════════════════

    // Child scope creation only
    suite.add('createChildScope()', () => {
        context.createChildScope('http');
    });

    // Child scope creation + getting injector
    suite.add('createChildScope().getInjector()', () => {
        context.createChildScope('http').getInjector(module);
    });

    return suite;
}
