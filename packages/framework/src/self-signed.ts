/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { generateKeyPairSync, randomBytes, sign } from 'crypto';
import { isIP } from 'net';

// Minimal DER (ASN.1) encoding, just enough to build an X.509 v3 certificate.

function der(tag: number, content: Buffer): Buffer {
    const length = content.length;
    let header: number[];
    if (length < 0x80) {
        header = [tag, length];
    } else {
        const bytes: number[] = [];
        for (let l = length; l > 0; l >>= 8) bytes.unshift(l & 0xff);
        header = [tag, 0x80 | bytes.length, ...bytes];
    }
    return Buffer.concat([Buffer.from(header), content]);
}

const sequence = (...items: Buffer[]) => der(0x30, Buffer.concat(items));

function oid(value: string): Buffer {
    const [first, second, ...rest] = value.split('.').map(Number);
    const bytes = [first * 40 + second];
    for (const part of rest) {
        const encoded = [part & 0x7f];
        for (let v = part >> 7; v > 0; v >>= 7) encoded.unshift(0x80 | (v & 0x7f));
        bytes.push(...encoded);
    }
    return der(0x06, Buffer.from(bytes));
}

function time(date: Date): Buffer {
    const iso = date.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    //UTCTime for years until 2049, GeneralizedTime after (RFC 5280)
    return date.getUTCFullYear() < 2050 ? der(0x17, Buffer.from(iso.slice(2))) : der(0x18, Buffer.from(iso));
}

function ipBytes(ip: string): Buffer {
    if (isIP(ip) === 4) return Buffer.from(ip.split('.').map(Number));
    //embedded IPv4, e.g. ::ffff:127.0.0.1
    const v4 = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) {
        const bytes = ipBytes(v4[2]);
        ip = v4[1] + bytes.readUInt16BE(0).toString(16) + ':' + bytes.readUInt16BE(2).toString(16);
    }
    const [head, tail] = ip.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = tail ? tail.split(':') : [];
    const groups =
        tail === undefined
            ? headGroups
            : [...headGroups, ...new Array(8 - headGroups.length - tailGroups.length).fill('0'), ...tailGroups];
    const buffer = Buffer.alloc(16);
    groups.forEach((group, i) => buffer.writeUInt16BE(parseInt(group, 16), i * 2));
    return buffer;
}

/**
 * Creates a self-signed certificate (RSA 2048, SHA-256) for the given host name or IP address,
 * with the host as common name and subject alternative name.
 */
export function createSelfSignedCertificate(host: string, days: number = 365): { cert: string; private: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

    const serial = randomBytes(16);
    serial[0] &= 0x7f; //positive
    if (serial[0] === 0) serial[0] = 1; //minimal encoding

    const algorithm = sequence(oid('1.2.840.113549.1.1.11'), der(0x05, Buffer.alloc(0))); //sha256WithRSAEncryption
    const name = sequence(der(0x31, sequence(oid('2.5.4.3'), der(0x0c, Buffer.from(host))))); //CN=host
    const notBefore = new Date();
    const notAfter = new Date(notBefore.getTime() + days * 24 * 60 * 60 * 1000);

    const altName = isIP(host) ? der(0x87, ipBytes(host)) : der(0x82, Buffer.from(host));
    const extensions = der(
        0xa3,
        sequence(
            sequence(oid('2.5.29.19'), der(0x04, sequence())), //basicConstraints: not a CA
            sequence(oid('2.5.29.17'), der(0x04, sequence(altName))), //subjectAltName
        ),
    );

    const tbs = sequence(
        der(0xa0, der(0x02, Buffer.from([2]))), //v3
        der(0x02, serial),
        algorithm,
        name,
        sequence(time(notBefore), time(notAfter)),
        name,
        publicKey.export({ type: 'spki', format: 'der' }),
        extensions,
    );
    const signature = sign('sha256', tbs, privateKey);
    const certificate = sequence(tbs, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), signature])));

    const base64 = certificate
        .toString('base64')
        .replace(/(.{64})/g, '$1\n')
        .replace(/\n$/, '');
    return {
        cert: `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`,
        private: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    };
}
