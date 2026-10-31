import { randomBytes } from 'crypto';

import { SessionEntity, UserEntity } from '@app/server/database';
import { Database } from '@deepkit/orm';

const argon2 = require('argon2');

export type SessionToken = string;

export class UserAuthentication {
    constructor(private database: Database) {
    }

    async getUserForToken(token: SessionToken): Promise<UserEntity | undefined> {
        const session = await this.database.query(SessionEntity)
            .filter({ token })
            .innerJoinWith('user')
            .findOneOrUndefined();

        if (session && session.expiresAt > new Date()) {
            return session.user;
        }

        // Session expired or not found
        return undefined;
    }

    async login(email: string, password: string): Promise<SessionToken> {
        let user = await this.database.query(UserEntity)
            .filter({ email })
            .findOneOrUndefined();

        if (!user) throw new Error('Credentials invalid');

        const validPassword = await argon2.verify(user.hash, password);
        if (!validPassword) throw new Error('Credentials invalid');

        const token = randomBytes(32).toString('base64url');
        const session = new SessionEntity(user, token);
        await this.database.persist(session);
        return token;
    }

    /** Admins are only created on the command line (user:create-admin), never by a login. */
    async createAdmin(email: string, password: string): Promise<void> {
        const user = new UserEntity(email);
        user.hash = await argon2.hash(password);
        user.role = 'admin';
        await this.database.persist(user);
    }
}
