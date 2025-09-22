import { benchmark, run } from '@deepkit/bench';
import { InjectorModule } from '../src/module.js';
import { InjectorContext } from '../src/injector.js';

class Service {
}

class Service2 {
}

const module = new InjectorModule([
    Service,
    { provide: Service2, scope: 'rpc' },
]);

const injector = new InjectorContext(module);

const message = new Uint8Array(32);


benchmark('injector.get', () => {
    injector.get(Service);
});

const resolver1 = injector.resolve(undefined, Service);

benchmark('resolver', () => {
    resolver1();
});

benchmark('scope create', () => {
    const scope = injector.createChildScope('rpc');
});

const scope = injector.createChildScope('rpc');

benchmark('scope.get cached', () => {
    scope.get(Service2);
});

benchmark('scope.get singleton', () => {
    scope.get(Service);
});

benchmark('scope.get new', () => {
    const scope = injector.createChildScope('rpc');
    scope.get(Service2);
});

const resolver2 = injector.resolve(module, Service2);

benchmark('scope resolver', () => {
    resolver2(scope.scope);
});

benchmark('baseline', () => {
    new Service2();
});

run();
