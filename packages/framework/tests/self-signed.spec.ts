import { expect, test } from '@jest/globals';
import { X509Certificate, createPrivateKey } from 'crypto';
import https from 'https';
import { AddressInfo } from 'net';

import { createSelfSignedCertificate } from '../src/self-signed.js';

test('self-signed certificate', () => {
    for (const host of ['localhost', 'my.example.com', '127.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1:2']) {
        const pems = createSelfSignedCertificate(host, 365);
        const certificate = new X509Certificate(pems.cert);
        const privateKey = createPrivateKey(pems.private);
        expect(certificate.subject).toBe('CN=' + host);
        expect(certificate.issuer).toBe('CN=' + host);
        expect(certificate.checkPrivateKey(privateKey)).toBe(true);
        expect(certificate.verify(certificate.publicKey)).toBe(true);
        expect(certificate.checkHost(host) || certificate.checkIP(host)).toBe(host);
        const days = (new Date(certificate.validTo).getTime() - new Date(certificate.validFrom).getTime()) / 86400000;
        expect(days).toBe(365);
    }
    expect(new X509Certificate(createSelfSignedCertificate('::1').cert).subjectAltName).toBe('IP Address:0:0:0:0:0:0:0:1');
    expect(new X509Certificate(createSelfSignedCertificate('::ffff:127.0.0.1').cert).subjectAltName).toBe('IP Address:0:0:0:0:0:FFFF:7F00:1');
});

test('self-signed certificate is accepted by TLS clients trusting it', async () => {
    const pems = createSelfSignedCertificate('localhost');
    const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => res.end('ok'));
    await new Promise<void>(resolve => server.listen(0, 'localhost', resolve));
    try {
        const port = (server.address() as AddressInfo).port;
        const body = await new Promise<string>((resolve, reject) => {
            https
                .get({ host: 'localhost', port, ca: pems.cert, path: '/' }, res => {
                    let data = '';
                    res.on('data', chunk => (data += chunk));
                    res.on('end', () => resolve(data));
                })
                .on('error', reject);
        });
        expect(body).toBe('ok');
    } finally {
        server.close();
    }
});
