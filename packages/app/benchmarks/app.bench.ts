/**
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { App, AppModule, createModule, createModuleClass } from '@deepkit/app';
import { BenchSuite } from '@deepkit/bench';

/**
 * App framework benchmark - tests Deepkit's App and module system performance
 *
 * This benchmark tests:
 * - Module creation
 * - App bootstrapping
 * - Configuration resolution
 * - Service container building
 * - Module imports
 */

// Simple config class for testing
class SimpleConfig {
    debug: boolean = false;
    port: number = 3000;
    host: string = 'localhost';
}

// Simple service for testing DI
class SimpleService {
    getValue(): number {
        return 42;
    }
}

// Another service for testing
class AnotherService {
    constructor(public simple: SimpleService) {}
}

// Module with config
class ConfiguredModule extends createModuleClass({
    config: SimpleConfig,
    providers: [SimpleService],
    exports: [SimpleService],
}) {}

// Module with providers
class ProviderModule extends createModuleClass({
    providers: [SimpleService, AnotherService],
    exports: [SimpleService, AnotherService],
}) {}

export default async function () {
    const suite = new BenchSuite('app/module');

    // Test 1: Create simple module
    {
        suite.add('createModule - empty', () => {
            createModule({});
        });
    }

    // Test 2: Create module with providers
    {
        suite.add('createModule - with providers', () => {
            createModule({
                providers: [SimpleService, AnotherService],
            });
        });
    }

    // Test 3: Instantiate module class
    {
        suite.add('module class instantiation', () => {
            new ConfiguredModule();
        });
    }

    // Test 4: Module class with config
    {
        suite.add('module class with config', () => {
            new ConfiguredModule({ debug: true, port: 8080 });
        });
    }

    // Test 5: Create App instance
    {
        suite.add('App creation - empty', () => {
            new App({});
        });
    }

    // Test 6: Create App with providers
    {
        suite.add('App creation - with providers', () => {
            new App({
                providers: [SimpleService],
            });
        });
    }

    // Test 7: Create App with imports
    {
        suite.add('App creation - with imports', () => {
            new App({
                imports: [new ConfiguredModule()],
            });
        });
    }

    // Test 8: App.get() - service resolution
    {
        const app = new App({
            providers: [SimpleService],
        });

        suite.add('App.get() - resolve service', () => {
            app.get(SimpleService);
        });
    }

    // Test 9: App.get() - resolve from imported module
    {
        const app = new App({
            imports: [new ProviderModule()],
        });

        suite.add('App.get() - from imported module', () => {
            app.get(SimpleService);
        });
    }

    // Test 10: Configure existing App
    {
        suite.add('App.configure()', () => {
            const app = new App({
                config: SimpleConfig,
            });
            app.configure({ debug: true, port: 9000 });
        });
    }

    // Test 11: Module with nested imports
    {
        class NestedModule extends createModuleClass({
            imports: undefined,
        }) {
            imports = [new ConfiguredModule()];
        }

        suite.add('App creation - nested imports', () => {
            new App({
                imports: [new NestedModule()],
            });
        });
    }

    // Test 12: App.setup() chain
    {
        suite.add('App.setup() chain', () => {
            const app = new App({
                config: SimpleConfig,
            });
            app.setup((module, config) => {
                // Setup callback
            });
        });
    }

    // Test 13: Module.configure()
    {
        suite.add('Module.configure()', () => {
            const module = new ConfiguredModule();
            module.configure({ debug: true, port: 8080, host: '0.0.0.0' });
        });
    }

    // Test 14: AppModule direct instantiation
    {
        suite.add('AppModule direct instantiation', () => {
            new AppModule(
                {},
                {
                    providers: [SimpleService],
                },
            );
        });
    }

    // Test 15: Multiple module imports
    {
        suite.add('App creation - 5 module imports', () => {
            new App({
                imports: [
                    new ConfiguredModule(),
                    new ConfiguredModule(),
                    new ConfiguredModule(),
                    new ConfiguredModule(),
                    new ConfiguredModule(),
                ],
            });
        });
    }

    return suite;
}
