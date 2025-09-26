import { expect, test } from '@jest/globals';
import { http, HttpKernel, HttpRequest } from '@deepkit/http';
import { App, createModule } from '@deepkit/app';
import { FrameworkModule } from '../../src/module.js';
import { SessionForRequest } from './session-for-request.dto.js';
import { AuthenticationModule } from './auth-module.js';

test('provider-visibility-issue', async () => {
    class IAMModule extends createModule({ exports: [AuthenticationModule] }) {
        imports = [new AuthenticationModule()];
    }


    @http.controller('/another')
    class AnotherDomainModuleController {
        @http.GET('/action')
        action(sess: SessionForRequest) {
            // Trying to consume "SessionForRequest" within another module – still no luck
            return sess;
        }
    }
    class AnotherDomainModule extends createModule({}) {
        controllers = [AnotherDomainModuleController];
    }

    class DomainModule extends createModule({ exports: [IAMModule] }) {
        imports = [new IAMModule(), new AnotherDomainModule()];
    }

    class InfrastructureModule extends createModule({
        // The whole issue gets "fixed" if DomainModule gets exported here, but what if I don't need to export it?
        exports: [],
    }) {
        imports = [new DomainModule()];
    }

    const app = new App({
        imports: [
            new FrameworkModule({ debug: true }),
            new InfrastructureModule(),
        ],
        providers: [],
    });

    /**
     * These fail due to the following error:
     *
     * Controller for route /auth/whoami parameter resolving error:
     * DependenciesUnmetError: Parameter sess is required but provider returned undefined.
     */
    expect((await app.get(HttpKernel).request(HttpRequest.GET('/auth/whoami'))).json).toMatchObject({
        sessionId: 'sidValue',
        userId: 'uidValue'
    });
    expect((await app.get(HttpKernel).request(HttpRequest.GET('/another/action'))).json).toMatchObject({
        sessionId: 'sidValue',
        userId: 'uidValue'
    });
});
