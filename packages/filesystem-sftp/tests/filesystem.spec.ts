import { test } from '@jest/globals';
import { setAdapterFactory } from '@deepkit/filesystem/test';
import { FilesystemSftpAdapter } from '../src/sftp-adapter.js';

setAdapterFactory(async () => {
    // defaults match docker-compose.yml
    const adapter = new FilesystemSftpAdapter({
        host: process.env.SFTP_HOST || 'localhost',
        port: Number(process.env.SFTP_PORT || 10022),
        user: process.env.SFTP_USER || 'user',
        password: process.env.SFTP_PASSWORD || '123',
        root: 'upload'
    });

    //reset all files
    await adapter.delete((await adapter.files('/')).map(v => v.path));

    return adapter;
});

// since we import .storage.spec.js, all its tests are scheduled to run
// we define 'basic' here too, so we can easily run just this test.
// also necessary to have at least once test in this file, so that WebStorm
// detects the file as a test file.
test('url', () => undefined);
test('basic', () => undefined);
test('append/prepend', () => undefined);
test('visibility', () => undefined);
test('recursive', () => undefined);
test('copy', () => undefined);
test('move', () => undefined);
