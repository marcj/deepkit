import { RpcControllerAccess, RpcKernelBaseConnection, RpcKernelSecurity, Session } from '@deepkit/rpc';
import { UserEntity } from '@app/server/database';
import { UserAuthentication } from '@app/server/user-authentication';

export class AppSession extends Session {
    constructor(public user: UserEntity) {
        super(user.email, undefined);
    }

    isAnonymous(): boolean {
        return false;
    }

    get isAdmin() {
        return this.user.role === 'admin';
    }
}

export class AppRpcKernelSecurity extends RpcKernelSecurity {
    constructor(private userAuthentication: UserAuthentication) {
        super();
    }

    override async hasControllerAccess(
        session: Session,
        controllerAccess: RpcControllerAccess,
        connection: RpcKernelBaseConnection,
    ): Promise<boolean> {
        if (controllerAccess.controllerName.startsWith('admin')) {
            return session instanceof AppSession && session.isAdmin;
        }
        return true;
    }

    override async authenticate(token: any, connection: RpcKernelBaseConnection): Promise<Session> {
        if (typeof token !== 'string' || !token) return new Session('anon', undefined);

        const user = await this.userAuthentication.getUserForToken(token);
        if (user) return new AppSession(user);

        return new Session('anon', undefined);
    }
}
