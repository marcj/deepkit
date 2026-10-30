import { http } from '../../src/decorator.js';
import { HttpBody } from '../../src/model.js';

interface UserBody {
    username: string;
    email: string;
}

// lives in its own file, see https://github.com/deepkit/deepkit-framework/issues/458
export class SeparateFileBodyController {
    @http.POST('/separate-file-body')
    handle(body: HttpBody<UserBody>) {
        return body;
    }
}
