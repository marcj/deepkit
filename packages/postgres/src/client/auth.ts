import { createHash, createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'crypto';

import { PostgresError } from './errors.js';

/** The password message for md5 authentication. */
export function md5Password(user: string, password: string, salt: Uint8Array): string {
    const inner = createHash('md5').update(password).update(user).digest('hex');
    return 'md5' + createHash('md5').update(inner).update(salt).digest('hex');
}

function hmac(key: Uint8Array, text: string): Buffer {
    return createHmac('sha256', key).update(text).digest();
}

function xor(a: Buffer, b: Buffer): Buffer {
    const out = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
    return out;
}

/** The client side of SCRAM-SHA-256, see RFC 5802 and RFC 7677. */
export class ScramClient {
    public readonly mechanism = 'SCRAM-SHA-256';
    protected serverSignature?: Buffer;

    constructor(protected nonce: string = randomBytes(18).toString('base64')) {}

    /** The user name is empty since the server takes it from the startup message. */
    get clientFirstBare(): string {
        return 'n=,r=' + this.nonce;
    }

    get clientFirst(): string {
        return 'n,,' + this.clientFirstBare;
    }

    clientFinal(serverFirst: string, password: string): Promise<string> {
        const attributes = new Map<string, string>();
        for (const part of serverFirst.split(',')) attributes.set(part[0], part.slice(2));
        const nonce = attributes.get('r');
        const salt = attributes.get('s');
        const iterations = Number(attributes.get('i'));
        if (!nonce || !nonce.startsWith(this.nonce) || nonce.length === this.nonce.length) {
            throw new PostgresError('SCRAM: server nonce does not match');
        }
        if (!salt || !Number.isInteger(iterations) || iterations < 1)
            throw new PostgresError('SCRAM: invalid server message');

        return new Promise<string>((resolve, reject) => {
            pbkdf2(password, Buffer.from(salt, 'base64'), iterations, 32, 'sha256', (error, salted) => {
                if (error) return reject(error);
                try {
                    const clientWithoutProof = 'c=biws,r=' + nonce;
                    const authMessage = this.clientFirstBare + ',' + serverFirst + ',' + clientWithoutProof;
                    const clientKey = hmac(salted, 'Client Key');
                    const storedKey = createHash('sha256').update(clientKey).digest();
                    const proof = xor(clientKey, hmac(storedKey, authMessage));
                    this.serverSignature = hmac(hmac(salted, 'Server Key'), authMessage);
                    resolve(clientWithoutProof + ',p=' + proof.toString('base64'));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /** Throws when the server did not prove it knows the password. */
    verifyServerFinal(serverFinal: string): void {
        if (!this.serverSignature) throw new PostgresError('SCRAM: unexpected final message');
        if (serverFinal.startsWith('e=')) throw new PostgresError('SCRAM: ' + serverFinal.slice(2));
        const signature = Buffer.from(
            serverFinal
                .split(',')
                .find(v => v.startsWith('v='))
                ?.slice(2) || '',
            'base64',
        );
        if (signature.length !== this.serverSignature.length || !timingSafeEqual(signature, this.serverSignature)) {
            throw new PostgresError('SCRAM: invalid server signature');
        }
    }
}
