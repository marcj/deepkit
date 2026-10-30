import { FilesystemAdapter, FilesystemFile, FileType, FileVisibility, Reporter } from './filesystem.js';
import { osPathDirectory, pathNormalize } from '@deepkit/core';
import type * as fs from 'fs/promises';

export interface FilesystemLocalAdapterOptions {
    root: string;
    permissions: {
        file: {
            public: number; //default 0o644
            private: number; //default 0o600
        },
        directory: {
            public: number; //default 0o755
            private: number; //default 0o700
        }
    };
}

/**
 * Windows paths (C:\data, \\server\share) are kept as they are, only trailing separators are removed.
 * pathNormalize() would turn them into /C:\data.
 */
function normalizeRoot(root: string): string {
    if (!/^([a-zA-Z]:[\\/]|\\\\)/.test(root)) return pathNormalize(root);
    root = root.replace(/[\\/]+$/, '');
    return /^[a-zA-Z]:$/.test(root) ? root + '\\' : root;
}

export class FilesystemLocalAdapter implements FilesystemAdapter {
    fs?: typeof fs;

    protected root: string;
    protected options: FilesystemLocalAdapterOptions = {
        root: '/',
        permissions: {
            file: {
                public: 0o644,
                private: 0o600
            },
            directory: {
                public: 0o755,
                private: 0o700
            }
        }
    };

    constructor(options: Partial<FilesystemLocalAdapterOptions>) {
        this.root = options.root ? normalizeRoot(options.root) : '/';
        Object.assign(this.options, options);
    }

    supportsVisibility() {
        return true;
    }

    supportsDirectory() {
        return true;
    }

    protected async getFs(): Promise<typeof fs> {
        if (!this.fs) this.fs = await import('fs/promises');
        return this.fs;
    }

    protected mapModeToVisibility(type: FileType, mode: number): FileVisibility {
        const permissions = this.options.permissions[type === 'file' ? 'file' : 'directory'];
        const fileMode = mode & 0o777;
        if (fileMode === permissions.public) return 'public';
        return 'private';
    }

    protected getMode(type: FileType, visibility: FileVisibility): number {
        const permissions = this.options.permissions[type === 'file' ? 'file' : 'directory'];
        return visibility === 'public' ? permissions.public : permissions.private;
    }

    getPath(path: string): string {
        return this.root + path;
    }

    async copy(source: string, destination: string, reporter: Reporter): Promise<void> {
        source = this.getPath(source);
        destination = this.getPath(destination);
        const fs = await this.getFs();
        await fs.cp(source, destination, { recursive: true });
    }

    async delete(paths: string[]): Promise<void> {
        const fs = await this.getFs();
        for (const path of paths) {
            await fs.rm(this.getPath(path));
        }
    }

    async makeDirectory(path: string, visibility: FileVisibility): Promise<void> {
        const fs = await this.getFs();
        await fs.mkdir(this.getPath(path), { recursive: true, mode: this.getMode('directory', visibility) });
    }

    async deleteDirectory(path: string, reporter: Reporter): Promise<void> {
        path = this.getPath(path);
        const fs = await this.getFs();
        await fs.rm(path, { recursive: true });
    }

    async exists(paths: string[]): Promise<boolean> {
        const fs = await this.getFs();
        for (const path of paths) {
            try {
                const res = await fs.stat(this.getPath(path));
                if (!res.isFile() && !res.isDirectory()) return false;
            } catch (error: any) {
                return false;
            }
        }
        return true;
    }

    async files(path: string): Promise<FilesystemFile[]> {
        const localPath = this.getPath(path);
        const files: FilesystemFile[] = [];
        const fs = await this.getFs();

        for (const name of await fs.readdir(localPath)) {
            const file = new FilesystemFile(path + '/' + name);
            const stat = await fs.stat(localPath + '/' + name);
            file.size = stat.isFile() ? stat.size : 0;
            file.lastModified = new Date(stat.mtime);
            file.visibility = this.mapModeToVisibility(stat.isFile() ? 'file' : 'directory', stat.mode);
            file.type = stat.isFile() ? 'file' : 'directory';
            files.push(file);
        }

        return files;
    }

    async allFiles(path: string, reporter: Reporter): Promise<FilesystemFile[]> {
        const files: FilesystemFile[] = [];
        const fs = await this.getFs();

        const queue: string[] = [path];
        while (!reporter.aborted && queue.length) {
            const currentPath = queue.shift()!;
            for (const name of await fs.readdir(this.getPath(currentPath))) {
                if (reporter.aborted) return files;
                const file = new FilesystemFile(currentPath + '/' + name);
                const stat = await fs.stat(this.getPath(currentPath + '/' + name));
                file.size = stat.isFile() ? stat.size : 0;
                file.lastModified = new Date(stat.mtime);
                file.visibility = this.mapModeToVisibility(stat.isFile() ? 'file' : 'directory', stat.mode);
                file.type = stat.isFile() ? 'file' : 'directory';
                files.push(file);
                reporter.progress(files.length, 0);
                if (file.isDirectory()) queue.push(file.path);
            }
        }

        return files;
    }

    async directories(path: string): Promise<FilesystemFile[]> {
        return (await this.files(path)).filter(file => file.isDirectory());
    }

    async allDirectories(path: string, reporter: Reporter): Promise<FilesystemFile[]> {
        const files: FilesystemFile[] = [];
        const fs = await this.getFs();

        const queue: string[] = [path];
        while (!reporter.aborted && queue.length) {
            const currentPath = queue.shift()!;
            for (const name of await fs.readdir(this.getPath(currentPath))) {
                if (reporter.aborted) return files;
                const file = new FilesystemFile(currentPath + '/' + name);
                const stat = await fs.stat(this.getPath(currentPath + '/' + name));
                if (!stat.isDirectory()) continue;
                file.size = stat.isFile() ? stat.size : 0;
                file.lastModified = new Date(stat.mtime);
                file.visibility = this.mapModeToVisibility(stat.isFile() ? 'file' : 'directory', stat.mode);
                file.type = stat.isFile() ? 'file' : 'directory';
                files.push(file);
                reporter.progress(files.length, 0);
                if (file.isDirectory()) queue.push(file.path);
            }
        }

        return files;
    }

    async get(path: string): Promise<FilesystemFile | undefined> {
        const localPath = this.getPath(path);
        const fs = await this.getFs();
        const file = new FilesystemFile(path);
        try {
            const stat = await fs.stat(localPath);
            file.size = stat.isFile() ? stat.size : 0;
            file.lastModified = new Date(stat.mtime);
            file.visibility = this.mapModeToVisibility(stat.isFile() ? 'file' : 'directory', stat.mode);
            file.type = stat.isFile() ? 'file' : 'directory';
            return file;
        } catch (error: any) {
            return undefined;
        }
    }

    async move(source: string, destination: string, reporter: Reporter): Promise<void> {
        source = this.getPath(source);
        destination = this.getPath(destination);
        const fs = await this.getFs();
        await fs.rename(source, destination);
    }

    async read(path: string, reporter: Reporter): Promise<Uint8Array> {
        path = this.getPath(path);
        const fs = await this.getFs();
        return await fs.readFile(path);
    }

    async write(path: string, contents: Uint8Array, visibility: FileVisibility, reporter: Reporter): Promise<void> {
        path = this.getPath(path);
        const fs = await this.getFs();
        await fs.mkdir(osPathDirectory(path), { recursive: true, mode: this.getMode('directory', visibility) });
        await fs.writeFile(path, contents, { mode: this.getMode('file', visibility) });
    }

    async append(path: string, contents: Uint8Array, reporter: Reporter): Promise<void> {
        path = this.getPath(path);
        const fs = await this.getFs();
        await fs.appendFile(path, contents);
    }

    async setVisibility(path: string, visibility: FileVisibility): Promise<void> {
        const fs = await this.getFs();
        await fs.chmod(this.getPath(path), this.getMode('file', visibility));
    }
}
