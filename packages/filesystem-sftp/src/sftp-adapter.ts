import { FileType, FileVisibility, Reporter, resolveFilesystemPath, FilesystemAdapter, FilesystemFile } from '@deepkit/filesystem';
import { pathDirectory, pathBasename } from '@deepkit/core';
import Client, { ConnectOptions, FileInfo } from 'ssh2-sftp-client';
import { Readable } from 'stream';
import { asyncOperation } from '@deepkit/core';

export interface FilesystemFtpOptions extends ConnectOptions {
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
 * String mode is 'r', 'w', 'rw', 'rwx', etc
 * convert to octal representation, rw = 0o6, rwx = 0o7, etc
 */
function stringModeToNumber(mode: string): number {
    let result = 0;
    if (mode.includes('r')) result += 4;
    if (mode.includes('w')) result += 2;
    if (mode.includes('x')) result += 1;
    return result;
}

export class FilesystemSftpAdapter implements FilesystemAdapter {
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
    protected closed = true;

    protected connectPromise?: Promise<void>;

    constructor(options: Partial<FilesystemFtpOptions> = {}) {
        Object.assign(this.options, options);
        this.client = new Client();
        this.client.on('end', (err) => {
            this.closed = true;
        });
    }

    supportsVisibility() {
        return true;
    }

    supportsDirectory() {
        return true;
    }

    protected getRemotePath(path: string): string {
        if (this.options.root === '') return path;
        return resolveFilesystemPath([this.options.root, path]);
    }

    protected stringModeToMode(rights: { user: string, group: string, other: string }): number {
        const user = stringModeToNumber(rights.user);
        const group = stringModeToNumber(rights.group);
        const other = stringModeToNumber(rights.other);
        return user * 64 + group * 8 + other;
    }

    protected mapModeToVisibility(type: FileType, rights: { user: string, group: string, other: string }): FileVisibility {
        const permissions = this.options.permissions[type === 'file' ? 'file' : 'directory'];
        // example rights.user="rwx", rights.group="rwx", rights.other="rwx"
        const mode = this.stringModeToMode(rights);
        if (mode === permissions.public) return 'public';
        return 'private';
    }

    async getVisibility(path: string): Promise<FileVisibility> {
        await this.ensureConnected();
        const file = await this.get(path);
        if (!file) throw new Error(`File ${path} not found`);
        return file.visibility;
    }

    async setVisibility(path: string, visibility: FileVisibility): Promise<void> {
        await this.ensureConnected();
        await this.chmod(path, this.getMode('file', visibility));
    }

    protected async chmodFile(path: string, permission: number) {
        await this.client.chmod(this.getRemotePath(path), permission);
    }

    protected async chmodRecursive(path: string, permission: number) {
        const dirs: string[] = [path];

        while (dirs.length > 0) {
            const dir = dirs.pop()!;
            const files = await this.client.list(this.getRemotePath(dir));
            for (const file of files) {
                const path = dir + '/' + file.name;
                if (file.type === 'd') {
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

    protected getMode(type: FileType, visibility: FileVisibility): number {
        const permissions = this.options.permissions[type === 'file' ? 'file' : 'directory'];
        return visibility === 'public' ? permissions.public : permissions.private;
    }

    async close(): Promise<void> {
        await this.client.end();
    }

    async ensureConnected(): Promise<void> {
        if (this.connectPromise) await this.connectPromise;
        if (!this.closed) return;
        this.connectPromise = asyncOperation(async (resolve) => {
            this.closed = false;
            await this.client.connect({
                host: this.options.host,
                port: this.options.port,
                username: this.options.user,
                password: this.options.password,
            });
            this.connectPromise = undefined;
            resolve(undefined);
        });
        await this.connectPromise;
    }

    async makeDirectory(path: string, visibility: FileVisibility): Promise<void> {
        await this.ensureConnected();
        if (path === '/') return;
        await this.client.mkdir(this.getRemotePath(path), true);
        await this.client.chmod(this.getRemotePath(path), this.getMode('directory', visibility));
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
            const file = await this.get(path);
            if (!file) continue;
            if (file?.isDirectory()) {
                await this.client.rmdir(this.getRemotePath(path), true);
            } else {
                await this.client.delete(this.getRemotePath(path));
            }
        }
    }

    async deleteDirectory(path: string, reporter: Reporter): Promise<void> {
        await this.ensureConnected();
        if (path === '/') {
            for (const file of await this.client.list(this.getRemotePath(path))) {
                await this.client.delete(this.getRemotePath(file.name));
            }
        } else {
            await this.client.rmdir(this.getRemotePath(path), true);
        }
    }

    async exists(paths: string[]): Promise<boolean> {
        await this.ensureConnected();

        for (const path of paths) {
            if (path === '/') continue;
            const exists = await this.client.exists(this.getRemotePath(path));
            if (!exists) return false;
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
        const file = new FilesystemFile(path, fileInfo.type !== 'd' ? 'file' : 'directory');
        // directory sizes are filesystem-specific (e.g. 4096 on ext4), report 0 like the local adapter
        file.size = file.type === 'file' ? fileInfo.size : 0;
        file.lastModified = new Date(fileInfo.modifyTime);
        file.visibility = this.mapModeToVisibility(file.type, fileInfo.rights);

        return file;
    }

    async move(source: string, destination: string, reporter: Reporter): Promise<void> {
        await this.client.rename(this.getRemotePath(source), this.getRemotePath(destination));
    }

    async read(path: string, reporter: Reporter): Promise<Uint8Array> {
        await this.ensureConnected();
        const remotePath = this.getRemotePath(path);
        return await this.client.get(remotePath, undefined) as Buffer;
    }

    async write(path: string, contents: Uint8Array, visibility: FileVisibility, reporter: Reporter): Promise<void> {
        await this.ensureConnected();
        await this.makeDirectory(pathDirectory(path), visibility);
        await this.client.put(createReadable(contents), this.getRemotePath(path));
        await this.client.chmod(this.getRemotePath(path), this.getMode('file', visibility));
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
