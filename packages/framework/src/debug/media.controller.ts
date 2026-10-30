/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { DebugMediaInterface, MediaFile } from '@deepkit/framework-debug-api';
import { rpc } from '@deepkit/rpc';
import { FilesystemRegistry } from '../filesystem.js';
import { Filesystem, FilesystemFile } from '@deepkit/filesystem';
import { pathDirectory, pathJoin } from '@deepkit/core';
import { getMimeType } from '@deepkit/http';

function mapFile(filesystem: number, file: FilesystemFile): MediaFile {
    const mediaFile = new MediaFile(file.path, file.type);
    mediaFile.size = file.size;
    mediaFile.filesystem = filesystem;
    mediaFile.lastModified = file.lastModified;
    mediaFile.visibility = file.visibility;
    mediaFile.mimeType = getMimeType(file.path) || '';
    return mediaFile;
}

@rpc.controller(DebugMediaInterface)
export class MediaController implements DebugMediaInterface {
    constructor(
        protected filesystemRegistry: FilesystemRegistry,
    ) {
    }

    protected getFilesystem(id: number): Filesystem {
        const fs = this.filesystemRegistry.getFilesystems()[id];
        if (!fs) throw new Error(`No filesystem with id ${id} found`);
        return fs;
    }

    @rpc.action()
    async getPublicUrl(fs: number, path: string): Promise<string> {
        const filesystem = this.getFilesystem(fs);
        return filesystem.publicUrl(path);
    }

    @rpc.action()
    async createFolder(fs: number, path: string): Promise<void> {
        const filesystem = this.getFilesystem(fs);
        await filesystem.makeDirectory(path);
    }

    @rpc.action()
    async getFile(fs: number, path: string): Promise<MediaFile | false> {
        const filesystem = this.getFilesystem(fs);
        const file = await filesystem.getOrUndefined(path);
        if (!file) return false;

        return mapFile(fs, file);
    }

    @rpc.action()
    async getFiles(fs: number, path: string): Promise<MediaFile[]> {
        const filesystem = this.getFilesystem(fs);
        const files = await filesystem.files(path);
        return files.map(file => mapFile(fs, file));
    }

    @rpc.action()
    async getMediaData(fs: number, path: string): Promise<Uint8Array | false> {
        const filesystem = this.getFilesystem(fs);
        try {
            return await filesystem.read(path);
        } catch (error) {
            return false;
        }
    }

    @rpc.action()
    async getMediaQuickLook(fs: number, path: string): Promise<{ file: MediaFile; data: Uint8Array } | false> {
        if (path === '/') return false;

        const filesystem = this.getFilesystem(fs);
        const file = await filesystem.get(path);
        const mimeType = getMimeType(path) || '';

        if (mimeType.startsWith('image/')) {
            const data = await filesystem.read(path);
            //todo: make smaller if too big
            return { file: mapFile(fs, file), data: data };
        }
        return false;
    }

    @rpc.action()
    async remove(fs: number, paths: string[]): Promise<void> {
        const filesystem = this.getFilesystem(fs);
        await filesystem.delete(paths);
    }

    @rpc.action()
    async addFile(fs: number, name: string, dir: string, data: Uint8Array): Promise<void> {
        const filesystem = this.getFilesystem(fs);
        await filesystem.write(pathJoin(dir, name), data);
    }

    @rpc.action()
    async renameFile(fs: number, path: string, newName: string): Promise<string> {
        const filesystem = this.getFilesystem(fs);
        filesystem.move(path, pathJoin(pathDirectory(path), newName));
        return Promise.resolve('');
    }
}
