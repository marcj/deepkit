import { test } from '@jest/globals';
import { setAdapterFactory } from '@deepkit/filesystem/test';
import { FilesystemFtpAdapter } from '../src/ftp-adapter.js';

setAdapterFactory(async () => {
    // defaults match docker-compose.yml
    const adapter = new FilesystemFtpAdapter({
        host: process.env.FTP_HOST || 'localhost',
        port: Number(process.env.FTP_PORT || 10021),
        user: process.env.FTP_USER || 'user',
        password: process.env.FTP_PASSWORD || '123',
    });

    //reset all files
    await adapter.clearWorkingDir();

    return adapter;
});

// since we import .filesystem.spec.js, all its tests are scheduled to run
// we define 'basic' here too, so we can easily run just this test.
// also necessary to have at least once test in this file, so that WebStorm
// detects the file as a test file.
test('basic', () => undefined);
test('recursive', () => undefined);
test('visibility', () => undefined);
test('copy', () => undefined);
test('move', () => undefined);
