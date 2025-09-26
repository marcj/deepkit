import { createModule } from '@deepkit/app';
import { SessionForRequest } from './session-for-request.dto.js';
import { AuthenticationListener } from './auth-listener.js';
import { http } from '@deepkit/http';


@http.controller('/auth')
class OAuth2Controller {
    @http.GET('/whoami')
    whoami(sess: SessionForRequest) {
        // Trying to consume "SessionForRequest" within the same module it's provided – no luck
        return sess;
    }
}

export class AuthenticationModule extends createModule({
    providers: [
        { provide: SessionForRequest, scope: 'http', useValue: undefined },
    ],
    controllers: [OAuth2Controller],
    listeners: [AuthenticationListener],
    exports: [SessionForRequest],
}) { }
