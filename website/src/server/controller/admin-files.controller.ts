import { rpc } from '@deepkit/rpc';
import type { FilesystemApi, FilesystemApiFile } from '@deepkit/desktop-ui';
import { Filesystem, FilesystemFile } from '@deepkit/filesystem';
import { getMimeType } from '@deepkit/http';
import { pathDirectory, pathJoin } from '@deepkit/core';
import { Jimp } from 'jimp';

function mapFile(file: FilesystemFile): FilesystemApiFile {
    return {
        path: file.path,
        type: file.type,
        lastModified: file.lastModified,
        size: file.size,
        visibility: file.visibility,
        mimeType: getMimeType(file.path) || '',
        // created: file.created,
    };
}

const supportedImageMimeTypes = [
    'image/bmp',
    'image/tiff',
    'image/x-ms-bmp',
    'image/gif',
    'image/jpeg',
    'image/png',
] as const;

function isImageMimeType(mimeType: string): mimeType is (typeof supportedImageMimeTypes)[number] {
    return supportedImageMimeTypes.includes(mimeType as (typeof supportedImageMimeTypes)[number]);
}

@rpc.controller('admin/files')
export class AdminFilesController implements FilesystemApi {
    constructor(private filesystem: Filesystem) {
    }

    protected getFilesystem(path: string): Filesystem {
        return this.filesystem;
    }

    @rpc.action()
    async getPublicUrl(path: string): Promise<string> {
        const filesystem = this.getFilesystem(path);
        return filesystem.publicUrl(path);
    }

    @rpc.action()
    async createFolder(path: string): Promise<void> {
        const filesystem = this.getFilesystem(path);
        await filesystem.makeDirectory(path);
    }

    @rpc.action()
    async getFile(path: string): Promise<FilesystemApiFile | undefined> {
        const filesystem = this.getFilesystem(path);
        const file = await filesystem.getOrUndefined(path);
        if (!file) return;

        return mapFile(file);
    }

    @rpc.action()
    async getFiles(path: string): Promise<FilesystemApiFile[]> {
        const filesystem = this.getFilesystem(path);
        const files = await filesystem.files(path);
        return files.map(file => mapFile(file));
    }

    @rpc.action()
    async getData(path: string): Promise<{ data: Uint8Array, mimeType: string } | undefined> {
        const filesystem = this.getFilesystem(path);
        try {
            const mimeType = getMimeType(path) || '';
            const data = await filesystem.read(path);
            return { data, mimeType };
        } catch (error) {
            return;
        }
    }

    @rpc.action()
    async getThumbnailData(path: string): Promise<{ data: Uint8Array, mimeType: string } | undefined> {
        if (path === '/') return;

        const filesystem = this.getFilesystem(path);
        let mimeType = getMimeType(path) || '';

        if (isImageMimeType(mimeType)) {
            let data = await filesystem.read(path);
            if (data.byteLength > 512 * 1024) {
                const image = await Jimp.read(Buffer.from(data));
                data = await image.resize({ w: 256, h: 256 }).getBuffer(mimeType);
            }
            return { data, mimeType };
        }

        const passThroughMimeTypes = [
            'image/svg+xml',
        ];
        if (passThroughMimeTypes.includes(mimeType)) {
            const data = await filesystem.read(path);
            return { data, mimeType };
        }

        return;
    }

    @rpc.action()
    async remove(paths: string[]): Promise<void> {
        if (!paths.length) return;
        const filesystem = this.getFilesystem(paths[0]);
        await filesystem.delete(paths);
    }

    @rpc.action()
    async addFile(name: string, dir: string, data: Uint8Array): Promise<void> {
        const path = pathJoin(dir, name);
        const filesystem = this.getFilesystem(path);
        await filesystem.write(path, data);
    }

    @rpc.action()
    async renameFile(path: string, newName: string): Promise<string> {
        const filesystem = this.getFilesystem(path);
        await filesystem.move(path, pathJoin(pathDirectory(path), newName));
        return newName;
    }
}
