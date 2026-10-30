import { http, HttpQuery, HttpResponse } from '@deepkit/http';
import { FilesystemRegistry } from '../filesystem.js';
import { Filesystem } from '@deepkit/filesystem';
import mime from 'mime-types';
import { Jimp } from 'jimp';

//@ts-ignore
import * as imageSize from 'probe-image-size';
import { Logger } from '@deepkit/logger';
import { formatError } from '@deepkit/core';

function send(response: HttpResponse, data: Uint8Array, name: string, mimeType?: string, lastModified?: Date) {
    response.setHeader('Cache-Control', 'max-age=31536000');
    response.setHeader('Expires', new Date(Date.now() + 31536000 * 1000).toUTCString());
    if (lastModified) {
        response.setHeader('Last-Modified', lastModified.toUTCString());
        response.setHeader('ETag', lastModified.getTime().toString());
    }
    response.setHeader('Content-Disposition', 'inline; filename="' + name + '"');
    mimeType = mimeType || '';
    if (mimeType) response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', data.byteLength);
    response.end(data);
}

export class DebugHttpController {
    constructor(
        protected filesystemRegistry: FilesystemRegistry,
        protected logger: Logger,
    ) {
    }

    protected getFilesystem(id: number): Filesystem {
        const fs = this.filesystemRegistry.getFilesystems()[id];
        if (!fs) throw new Error(`No filesystem with id ${id} found`);
        return fs;
    }


    @http.GET('api/media/:fs')
    async media(fs: number, path: HttpQuery<string>, response: HttpResponse) {
        const filesystem = this.getFilesystem(fs);
        const file = await filesystem.get(path);
        const mimeType = mime.lookup(path) || '';
        //todo stream
        const data = await filesystem.read(path);
        send(response, data, file.name, mimeType, file.lastModified);
    }


    @http.GET('api/media/:fs/preview')
    async mediaPreview(fs: number, path: HttpQuery<string>, response: HttpResponse) {
        const filesystem = this.getFilesystem(fs);
        const file = await filesystem.get(path);
        const mimeType = mime.lookup(path) || '';

        if (mimeType.startsWith('image/')) {
            const data = await filesystem.read(path);
            if (mimeType === 'image/svg+xml') {
                send(response, data, file.name, mimeType, file.lastModified);
                return;
            }

            const size = imageSize.sync(Buffer.from(data));
            if (size.width || 0 > 400 || size.height || 0 > 400) {
                try {
                    const img = await Jimp.read(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
                    const buffer = await img.scaleToFit({w: 800, h: 800}).getBuffer(mimeType as any);
                    send(response, buffer, file.name, mimeType, file.lastModified);
                    return;
                } catch (error: any) {
                    this.logger.log(`Error resizing image ${path}: ${formatError(error)}`);
                    return response.status(404);
                }
            }

            send(response, data, file.name, mimeType, file.lastModified);
            return;
        }

        return response.status(404);
    }
}
