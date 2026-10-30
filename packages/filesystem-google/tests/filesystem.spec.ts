import { test } from '@jest/globals';
import { Filesystem } from '@deepkit/filesystem';
import { adapterFactory, setAdapterFactory } from '@deepkit/filesystem/test';
import { FilesystemGoogleAdapter } from '../src/google-adapter.js';
import { homedir } from 'os';
import { writeFileSync } from 'fs';

Error.stackTraceLimit = 50;

// Defaults to fake-gcs-server from docker-compose.yml. Set GCS_ENDPOINT='' to run against real Google Cloud Storage.
const GCS_ENDPOINT = process.env.GCS_ENDPOINT ?? 'http://localhost:10443';

setAdapterFactory(async () => {
    const folder = 'test-folder-dont-delete';

    if (GCS_ENDPOINT) {
        const adapter = new FilesystemGoogleAdapter({
            bucket: process.env.GCS_BUCKET || 'deepkit-test',
            path: folder,
            projectId: 'test-project',
            apiEndpoint: GCS_ENDPOINT,
        });
        await new Filesystem(adapter).deleteDirectory('/');
        return adapter;
    }

    const keyFilename = homedir() + '/.google/deepkit-filesystem-integration-tests.json';
    if (process.env.GOOGLE_STORAGE_KEY) {
        writeFileSync(keyFilename, process.env.GOOGLE_STORAGE_KEY);
    }

    let adapter = new FilesystemGoogleAdapter({
        bucket: 'deepkit-integration-tests',
        path: folder,
        projectId: 'deepkit',
        keyFilename,
        // jsonAuth: process.env.GOOGLE_STORAGE_KEY
    });

    //reset all files
    const filesystem = new Filesystem(adapter);
    await filesystem.deleteDirectory('/');

    return adapter;
});

test('base', async () => {
    const filesystem = new Filesystem(await adapterFactory());
    await filesystem.write('/hello.txt', 'hello world', 'public');
    await filesystem.write('/secret.txt', '🔥', 'private');
    // const content = await filesystem.readAsText('/hello.txt');
    // expect(content).toBe('hello world');
    //
    // await filesystem.makeDirectory('/folder12');
    // await filesystem.makeDirectory('/folder1');
    // await filesystem.makeDirectory('/folder1/yes');

    // const files = await filesystem.files('/folder');
    // console.log(files);

    // const file1 = await filesystem.get('/hello.txt');
    // console.log('hello.txt', file1);

    const file2 = await filesystem.get('/secret.txt');
    console.log('secret.txt', file2);

    // const dir = await filesystem.get('/folder1');
    // console.log('fodler1', dir);
    //
    // const files = await filesystem.files('/');
    // console.log('/', files);
});

// since we import .filesystem.spec.js, all its tests are scheduled to run
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
