import { FilesystemAdapter, FilesystemFile, FileType, FileVisibility, Reporter, resolveFilesystemPath } from '@deepkit/filesystem';
import { pathDirectory, pathBasename } from '@deepkit/core';
import { Client, FileInfo, UnixPermissions } from 'basic-ftp';
import type { ConnectionOptions as TLSConnectionOptions } from 'tls';
import { Readable, Writable } from 'stream';

export interface FilesystemFtpOptions {
    /**
     * The root path where all files are stored. Optional, default is )" (standard working directory of FTP server_.
     */
    root: string;

    /**
     * Host the client should connect to. Optional, default is "localhost".
     */
    host: string;

    /**
     * Port the client should connect to. Optional, default is 21.
     */
    port?: number;

    /**
     * Timeout in secnds for all client commands. Optional, default is 30 seconds.
     */
    timeout?: number;

    user: string;

    password: string;

    /**
     * Use FTPS over TLS. Optional, default is false.
     * True is preferred explicit TLS, "implicit" supports legacy, non-standardized implicit TLS.
     */
    secure?: boolean;
    secureOptions?: TLSConnectionOptions;

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

export class FilesystemFtpAdapter implements FilesystemAdapter {
    client: Client;
    options: FilesystemFtpOptions = {
        root: '',
        host: 'localhost',
        user: '',
        password: '',
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

    constructor(options: Partial<FilesystemFtpOptions> = {}) {
        Object.assign(this.options, options);
        this.client = new Client(this.options.timeout);
    }

    /**
     * Mode is a number returned from Node's stat operation.
     */
    protected mapModeToVisibility(type: FileType, remotePermission?: UnixPermissions): FileVisibility {
        if (!remotePermission) return 'private';
        const permissions = this.options.permissions[type === 'file' ? 'file' : 'directory'];
        //permission={user: 6, group: 4, world: 4} => 0o644 in octal
        const mode = remotePermission.user * 64 + remotePermission.group * 8 + remotePermission.world;
        if (mode === permissions.public) return 'public';
        return 'private';
    }

    protected getMode(type: FileType, visibility: FileVisibility): number {
        const permissions = this.options.permissions[type === 'file' ? 'file' : 'directory'];
        return visibility === 'public' ? permissions.public : permissions.private;
    }

    supportsVisibility() {
        return true;
    }

    supportsDirectory() {
        return true;
    }

    async clearWorkingDir() {
        await this.ensureConnected();
        await this.client.clearWorkingDir();
    }

    protected getRemotePath(path: string): string {
        if (this.options.root === '') return path;
        return resolveFilesystemPath([this.options.root, path]);
    }

    async close(): Promise<void> {
        this.client.close();
    }

    async ensureConnected(): Promise<void> {
        if (!this.client.closed) return;
        await this.client.access({
            host: this.options.host,
            port: this.options.port,
            user: this.options.user,
            password: this.options.password,
            secure: this.options.secure,
            secureOptions: this.options.secureOptions,
        });
    }

    async makeDirectory(path: string, visibility: FileVisibility): Promise<void> {
        await this.ensureConnected();
        const remotePath = this.getRemotePath(path);
        await this.client.ensureDir(remotePath);
        await this.chmodFile(path, this.getMode('directory', visibility));
    }

    async setVisibility(path: string, visibility: FileVisibility): Promise<void> {
        await this.ensureConnected();
        await this.chmod(path, this.getMode('file', visibility));
    }

    async getVisibility(path: string): Promise<FileVisibility> {
        await this.ensureConnected();
        const file = await this.get(path);
        if (!file) throw new Error(`File ${path} not found`);
        return file.visibility;
    }

    async files(path: string): Promise<FilesystemFile[]> {
        return await this.getFiles(path, false);
    }

    protected async getFiles(path: string, recursive: boolean = false): Promise<FilesystemFile[]> {
        await this.ensureConnected();
        const remotePath = this.getRemotePath(path);
        const entries = await this.client.list(remotePath);
        return entries.map(v => this.createFilesystemFile(path + '/' + v.name, v));
    }

    async delete(paths: string[]): Promise<void> {
        await this.ensureConnected();
        for (const path of paths) {
            const remotePath = this.getRemotePath(path);
            await this.client.remove(remotePath);
        }
    }

    async deleteDirectory(path: string, reporter: Reporter): Promise<void> {
        await this.ensureConnected();
        const remotePath = this.getRemotePath(path);
        await this.client.removeDir(remotePath);
    }

    async exists(paths: string[]): Promise<boolean> {
        await this.ensureConnected();
        const foldersToCheck: { folder: string, names: string[] }[] = [];

        for (const path of paths) {
            if (path === '/') continue;
            const folder = pathDirectory(path);
            const entry = foldersToCheck.find(v => v.folder === folder);
            if (entry) {
                entry.names.push(pathBasename(path));
            } else {
                foldersToCheck.push({ folder, names: [pathBasename(path)] });
            }
        }

        for (const folders of foldersToCheck) {
            const remotePath = this.getRemotePath(folders.folder);
            const files = await this.client.list(remotePath);
            for (const name of folders.names) {
                if (!files.find(v => v.name === name)) return false;
            }
        }

        return true;
    }

    async get(path: string): Promise<FilesystemFile | undefined> {
        if (path === '/') return;
        await this.ensureConnected();
        const remotePath = this.getRemotePath(pathDirectory(path));
        const files = await this.client.list(remotePath);
        const basename = pathBasename(path);
        const entry = files.find(v => v.name === basename);
        if (!entry) return;
        return this.createFilesystemFile(path, entry);
    }

    protected createFilesystemFile(path: string, fileInfo: FileInfo): FilesystemFile {
        const file = new FilesystemFile(path, fileInfo.isFile ? 'file' : 'directory');
        // directory sizes are filesystem-specific (e.g. 4096 on ext4), report 0 like the local adapter
        file.size = file.type === 'file' ? fileInfo.size : 0;
        file.lastModified = fileInfo.modifiedAt;
        file.visibility = this.mapModeToVisibility(file.type, fileInfo.permissions);
        if (!file.lastModified && fileInfo.rawModifiedAt) {
            file.lastModified = parseCustomDateString(fileInfo.rawModifiedAt);
        }
        return file;
    }

    async move(source: string, destination: string, reporter: Reporter): Promise<void> {
        await this.client.rename(this.getRemotePath(source), this.getRemotePath(destination));
    }

    async read(path: string, reporter: Reporter): Promise<Uint8Array> {
        await this.ensureConnected();
        const remotePath = this.getRemotePath(path);
        const chunks: Uint8Array[] = [];
        const writeable = new Writable({
            write(chunk: any, encoding: BufferEncoding, callback: (error?: (Error | null)) => void) {
                chunks.push(chunk);
                callback(null);
            }
        });
        const stream = await this.client.downloadTo(writeable, remotePath);
        return Buffer.concat(chunks);
    }

    async write(path: string, contents: Uint8Array, visibility: FileVisibility, reporter: Reporter): Promise<void> {
        await this.ensureConnected();
        await this.makeDirectory(pathDirectory(path), visibility);
        await this.client.uploadFrom(createReadable(contents), this.getRemotePath(path));
        await this.chmodFile(path, this.getMode('file', visibility));
    }

    protected async chmodFile(path: string, permission: number) {
        await this.client.send('SITE CHMOD ' + permission.toString(8) + ' ' + this.getRemotePath(path));
    }

    protected async chmodRecursive(path: string, permission: number) {
        const dirs: string[] = [path];

        while (dirs.length > 0) {
            const dir = dirs.pop()!;
            const files = await this.client.list(this.getRemotePath(dir));
            for (const file of files) {
                const path = dir + '/' + file.name;
                if (file.isDirectory) {
                    dirs.push(path);
                } else {
                    await this.chmodFile(path, permission);
                }
            }
        }
    }

    protected async chmod(path: string, permission: number) {
        const file = await this.get(path);
        if (!file) return;
        if (file.isFile()) {
            await this.chmodFile(path, permission);
            return;
        }

        await this.chmodRecursive(path, permission);
    }
}

/**
 * Best effort to parse date strings like `22 Oct 10 12:45` or `Oct 10 12:45` into a Date object.
 */
function parseCustomDateString(dateString: string): Date | undefined {
    const currentYear = new Date().getFullYear();

    const twoDigitYearMatch = dateString.match(/^\d{2}\s/);
    const fourDigitYearMatch = dateString.match(/^\d{4}\s/);

    let fullDateString;

    if (twoDigitYearMatch) {
        // Handle '22 Oct 10 12:45' format.
        const twoDigitYear = twoDigitYearMatch[0].trim();
        const baseYear = currentYear.toString().substring(0, 2); // Get the first two digits of the current year.
        fullDateString = `${baseYear}${twoDigitYear} ${dateString.substring(3)}`;
    } else if (fourDigitYearMatch) {
        // Handle '2022 Oct 10 12:45' format.
        fullDateString = dateString;
    } else {
        // Handle 'Oct 10 12:45' format.
        fullDateString = `${dateString} ${currentYear}`;
    }

    return new Date(fullDateString);
}

function createReadable(buffer: Uint8Array): Readable {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
}
