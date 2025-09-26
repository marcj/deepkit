import { eventDispatcher } from '@deepkit/event';
import { httpWorkflow } from '@deepkit/http';
import { AuthenticationModule } from './auth-module.js';
import { SessionForRequest } from './session-for-request.dto.js';

export class AuthenticationListener {
    @eventDispatcher.listen(httpWorkflow.onAuth)
    onAuth(event: typeof httpWorkflow.onAuth.event, module: AuthenticationModule) {
        event.injectorContext.set(
            SessionForRequest,
            new SessionForRequest(
                'sidValue',
                'uidValue',
            ),
            module
        );
    }
}
