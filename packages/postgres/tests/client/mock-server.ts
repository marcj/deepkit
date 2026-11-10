import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { Server, Socket, createServer } from 'net';
import { TLSSocket } from 'tls';

/** Test only key material for the TLS upgrade. */
const testKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDtsbSA0DzU7hux
sHFbnDnVN+iDwFsP7woDyN4iBz8YCnKFwJYuePG4jZv/5jPOQ2iP6Btb5RwYzS8a
HSsQHhQmz8pZTMByvKvhjTEOfOGEccKl7MoHMZlkGTH/2ARqhbHRYIWGx7KK7Rc5
qxUwlk9fkwpUJI4ranSyma51kv4ZyyXyv70+8eZvBmsNbrRA8w2HbOj8EbWFa6Y5
Y3W/G0cHV7ZBiSSyf/4hDJxrEDgYX9qHb8gFm8yV+fkXxGkDbIrymnl737O8H5Ag
ecX2tZpRJQZKDF8gqoaQ8ynvHv94V/aDnFlvKWrHqOq5IWbzz91XLITzLaBtg1tv
8Aq7gbP9AgMBAAECggEBAL7H1XNWsJzPiNb0Ieg/2oNy3mNxbyW43TbwcKqrWk73
g7grPd+LH6jbsIySvp4dqL1otRzrJcQaXGX/Z2MGYXJNccJ/QjBVkzf0VZ2lSnU9
wdff2MAxZUbcmi8ZuWGucWz2pfXqLzom1m9pDBb1bjvuD2o99QaP6Z64jzi7hMw5
n/AgP7fqLVLzGRE6chkum4m2sHr6tEOoz7sQmydxnYWHSuP/a35Yv1kb0asgj/yn
19L1IOrcwyRzf0pvhjrYpVYvrYZrRYOgWfy6R2q/AU87EdLG7pF4v6Z6ScuPcSXk
q6pD8UXl2HDdgQrXAsMgKtX1i2GkN07Lp/i92URaRhkCgYEA+qUHsB2ZJXDvVb9j
upLFoW22mpRYh4+dUz860H0EGj81+3bVp6M3qVM/WelP3RoM4sZonfWj5auKmxtL
lunrV6OSTCqffPWSHMEI5Gl31RRt4iU8zjXUex/KZYy7wX3U6GUCMdStxQi0NBLk
h/hIQUxSX3/sVyb2XuiTtfSfZH8CgYEA8sXWu2DHvRV8xMm6e5hGEFxlINCxbPaR
1WWEblx0arhSFV/7Wmteps8hLZDHW6242H72WHFBhqVVga3exotQW2MY8ICPtSGS
JOL30MGp6Lbq0h7epXtwm1NxeY3cbhqkm8ud05M+3rjh6yjmTbC7tAjnUaJn6evt
bAOUgMLvOYMCgYEA0hEki1+TLkUj4jsBC6rdhnlcdNvmAt/D3LR+x6QvnwvhY3tq
gBCUow6JZwLbE5U0vY/KuLDah7Ao/+x1gutUemQ2Ri3m86Uhq4XBvSYD8AsqOUI6
Xx3QkszHJis4ZWff3FJj732vkhbEaWx4KtlVPZ0I4M9nNngKPusweWyndmMCgYBP
DRSq1wyzCTgja/yJGkBWO3/Ce7IKZQ9/iRriRMCzr2krBKH4A1ZCwtdu2uHPfHXg
KRdWHSrVCSkanN8Zj2uPFmmchoBE3rWTxUQkeas117oGyX5+K/+y1CzzA7pvL8XB
5T9zEVM7esA1ro+vZIj6Spvn/RYRGX2p2lCUzOTQuQKBgHhwWAPnQHvxzM+2BaXL
g2F1Vfuk2QxTXsqZgmZAW/2256awLZjMMm77wWza/extBhpobA2tP0oH1d7r2Jgm
czSdg/1l45ifzXpZ2S3MHqSmI7eqmlCvCjOddrNfrkOLhrcS+F23II2/DJUQnSbb
cvrQzfr3pngXjhuuv7zQKzma
-----END PRIVATE KEY-----`;
const testCert = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQCJpOxthelL4jANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjYxMTA5MjMyNzU4WhcNNDYxMTA0MjMyNzU4WjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDt
sbSA0DzU7huxsHFbnDnVN+iDwFsP7woDyN4iBz8YCnKFwJYuePG4jZv/5jPOQ2iP
6Btb5RwYzS8aHSsQHhQmz8pZTMByvKvhjTEOfOGEccKl7MoHMZlkGTH/2ARqhbHR
YIWGx7KK7Rc5qxUwlk9fkwpUJI4ranSyma51kv4ZyyXyv70+8eZvBmsNbrRA8w2H
bOj8EbWFa6Y5Y3W/G0cHV7ZBiSSyf/4hDJxrEDgYX9qHb8gFm8yV+fkXxGkDbIry
mnl737O8H5AgecX2tZpRJQZKDF8gqoaQ8ynvHv94V/aDnFlvKWrHqOq5IWbzz91X
LITzLaBtg1tv8Aq7gbP9AgMBAAEwDQYJKoZIhvcNAQELBQADggEBAHInLX3dtusU
5CHFgsiHURzAXyuiCxlWXC45E6iYsAn4ZYyeNd8bJ3N3IGuLtBBqf2sEMaqbV/Cs
kWkM2wc8YMuuO4ouAen28f8Hf70+Qejvk+H5JEluJmKZBOxOWgazZQqbDPs21HPM
1eBrfE2OKaogL2vbHUkpMoYGWws6men0K5rg96Yigrjp14mFRJk8IPlfebNrkqvx
iZvw8LLtHG/tWVlzTyXfqZF1qI9sZ1VXw/SkpAihqtDC89U7dGAakLO3sQbzHeu2
63Mp3PpABmH1CZqrIIxGMcPi5ZQn7HMDNFdyEYqqbBRVOeBfMH4SW0OTJ2Y2vMmE
zoCoF3X6xWM=
-----END CERTIFICATE-----`;

export type AuthMethod = 'trust' | 'cleartext' | 'md5' | 'scram' | 'scram-bad-signature' | 'unsupported';

function frame(type: string, body: Buffer = Buffer.alloc(0)): Buffer {
    const header = Buffer.alloc(5);
    header.write(type, 0, 'latin1');
    header.writeInt32BE(body.length + 4, 1);
    return Buffer.concat([header, body]);
}

function int32(value: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeInt32BE(value);
    return b;
}

function ready(): Buffer {
    return Buffer.concat([
        frame('R', int32(0)),
        frame('S', Buffer.from('server_version\x0014.0\x00')),
        frame('K', Buffer.concat([int32(42), int32(43)])),
        frame('Z', Buffer.from('I')),
    ]);
}

function errorResponse(code: string, message: string): Buffer {
    return frame('E', Buffer.from(`SFATAL\0VFATAL\0C${code}\0M${message}\0\0`));
}

/**
 * A server that only speaks the startup and authentication part of the protocol. A real server can't be
 * used to cover those: the shared test server is configured for trust only.
 */
export function createAuthServer(
    method: AuthMethod,
    user: string,
    password: string,
    tls: boolean = false,
): Promise<{ port: number; server: Server; accepted: () => string[] }> {
    const accepted: string[] = [];
    const server = createServer((socket: Socket) => {
        let buffer = Buffer.alloc(0);
        let started = false;
        let clientFirstBare = '';
        let serverFirst = '';
        let salt = randomBytes(16);
        const iterations = 4096;
        const combinedNonce = randomBytes(18).toString('base64');
        const md5Salt = randomBytes(4);

        let transport: Socket = socket;
        const onData = (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (true) {
                if (!started) {
                    if (buffer.length < 4) return;
                    const size = buffer.readInt32BE(0);
                    if (buffer.length < size) return;
                    if (tls && size === 8 && buffer.readInt32BE(4) === 80877103) {
                        // answer the SSLRequest and continue the conversation over TLS
                        buffer = buffer.subarray(size);
                        socket.removeListener('data', onData);
                        transport.write('S');
                        const secure = new TLSSocket(socket, { isServer: true, key: testKey, cert: testCert });
                        secure.on('error', () => undefined);
                        secure.on('data', onData);
                        transport = secure;
                        return;
                    }
                    buffer = buffer.subarray(size);
                    started = true;
                    if (method === 'trust') transport.write(ready());
                    if (method === 'cleartext') transport.write(frame('R', int32(3)));
                    if (method === 'md5') transport.write(frame('R', Buffer.concat([int32(5), md5Salt])));
                    if (method === 'scram' || method === 'scram-bad-signature')
                        transport.write(frame('R', Buffer.concat([int32(10), Buffer.from('SCRAM-SHA-256\0\0')])));
                    if (method === 'unsupported') transport.write(frame('R', int32(7)));
                    continue;
                }
                if (buffer.length < 5) return;
                const size = buffer.readInt32BE(1);
                if (buffer.length < size + 1) return;
                const type = buffer.toString('latin1', 0, 1);
                const body = buffer.subarray(5, size + 1);
                buffer = buffer.subarray(size + 1);
                if (type === 'X') return;
                if (type === 'Q') {
                    transport.write(
                        Buffer.concat([frame('C', Buffer.from('SELECT 0\0')), frame('Z', Buffer.from('I'))]),
                    );
                    continue;
                }
                if (type !== 'p') continue;

                if (method === 'cleartext') {
                    const given = body.subarray(0, body.length - 1).toString();
                    accepted.push(given);
                    transport.write(
                        given === password ? ready() : errorResponse('28P01', 'password authentication failed'),
                    );
                } else if (method === 'md5') {
                    const given = body.subarray(0, body.length - 1).toString();
                    const inner = createHash('md5').update(password).update(user).digest('hex');
                    const expected = 'md5' + createHash('md5').update(inner).update(md5Salt).digest('hex');
                    accepted.push(given);
                    transport.write(
                        given === expected ? ready() : errorResponse('28P01', 'password authentication failed'),
                    );
                } else if (!clientFirstBare) {
                    const zero = body.indexOf(0);
                    const message = body.subarray(zero + 5).toString();
                    clientFirstBare = message.slice(3);
                    const clientNonce = clientFirstBare.slice(clientFirstBare.indexOf('r=') + 2);
                    serverFirst = `r=${clientNonce}${combinedNonce},s=${salt.toString('base64')},i=${iterations}`;
                    transport.write(frame('R', Buffer.concat([int32(11), Buffer.from(serverFirst)])));
                } else {
                    const message = body.toString();
                    const withoutProof = message.slice(0, message.lastIndexOf(',p='));
                    const proof = Buffer.from(message.slice(message.lastIndexOf(',p=') + 3), 'base64');
                    const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
                    const authMessage = clientFirstBare + ',' + serverFirst + ',' + withoutProof;
                    const clientKey = createHmac('sha256', salted).update('Client Key').digest();
                    const storedKey = createHash('sha256').update(clientKey).digest();
                    const signature = createHmac('sha256', storedKey).update(authMessage).digest();
                    const actual = Buffer.alloc(32);
                    for (let i = 0; i < 32; i++) actual[i] = clientKey[i] ^ signature[i];
                    const valid = proof.length === 32 && timingSafeEqual(actual, proof);
                    accepted.push(valid ? 'valid' : 'invalid');
                    if (!valid) {
                        transport.write(errorResponse('28P01', 'password authentication failed'));
                        continue;
                    }
                    const serverSignature =
                        method === 'scram-bad-signature'
                            ? Buffer.alloc(32)
                            : createHmac('sha256', createHmac('sha256', salted).update('Server Key').digest())
                                  .update(authMessage)
                                  .digest();
                    transport.write(
                        frame('R', Buffer.concat([int32(12), Buffer.from('v=' + serverSignature.toString('base64'))])),
                    );
                    if (method === 'scram') transport.write(ready());
                }
            }
        };
        socket.on('error', () => undefined);
        socket.on('data', onData);
    });
    return new Promise(resolve =>
        server.listen(0, '127.0.0.1', () =>
            resolve({ port: (server.address() as any).port, server, accepted: () => accepted }),
        ),
    );
}
