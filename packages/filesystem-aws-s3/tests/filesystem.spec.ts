import { expect, test } from '@jest/globals';
import { adapterFactory, setAdapterFactory } from '@deepkit/filesystem/test';
import { FilesystemAwsS3Adapter } from '../src/s3-adapter.js';
import { Filesystem } from '@deepkit/filesystem';
import { ListObjectsCommand } from '@aws-sdk/client-s3';

// Defaults match the S3 server in docker-compose.yml. Set S3_ENDPOINT='' to run against real AWS.
const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:10900';

setAdapterFactory(async () => {
    const folder = 'test-folder-dont-delete';
    const adapter = new FilesystemAwsS3Adapter({
        region: process.env.S3_REGION || (S3_ENDPOINT ? 'us-east-1' : 'eu-central-1'),
        bucket: process.env.S3_BUCKET || (S3_ENDPOINT ? 'deepkit-test' : 'deepkit-filesystem-integration-tests'),
        path: folder,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        endpoint: S3_ENDPOINT || undefined,
        forcePathStyle: !!S3_ENDPOINT,
    });

    //reset all files
    await new Filesystem(adapter).deleteDirectory('/');

    return adapter;
});

test('s3 url', async () => {
    const adapter = await adapterFactory() as FilesystemAwsS3Adapter;
    const filesystem = new Filesystem(adapter);

    await filesystem.write('test.txt', 'abc', 'public');
    const url = await filesystem.publicUrl('test.txt');
    expect(url).toBe(`https://${adapter.options.bucket}.s3.${adapter.options.region}.amazonaws.com/test-folder-dont-delete/test.txt`);
});

test('s3 keys have no leading slash', async () => {
    const adapter = await adapterFactory() as FilesystemAwsS3Adapter;
    const filesystem = new Filesystem(adapter);

    await filesystem.write('/folder/test.txt', 'abc');
    const response = await adapter.client.send(new ListObjectsCommand({ Bucket: adapter.options.bucket, Prefix: 'test-folder-dont-delete/' }));
    expect(response.Contents?.map(v => v.Key)).toContain('test-folder-dont-delete/folder/test.txt');
});

// since we import .filesystem.spec.js, all its tests are scheduled to run
// we define 'basic' here too, so we can easily run just this test.
// also necessary to have at least once test in this file, so that WebStorm
// detects the file as a test file.
test('basic', () => undefined);
test('visibility', () => undefined);
test('recursive', () => undefined);
test('copy', () => undefined);
test('move', () => undefined);
