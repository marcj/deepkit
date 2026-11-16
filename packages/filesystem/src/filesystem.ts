import { asyncOperation, Inject, isFunction, pathBasename, pathExtension, pathJoin, pathNormalize } from '@deepkit/core';
import { readFile } from 'fs/promises';

export type FileType = 'file' | 'directory';

/**
 * Settings for file and directory permissions.
 *
 * Unknown when the adapter can't read it. Can be unknown in files() due to limits of listings in adapter, but available in get().
 */
export type FileVisibility = 'public' | 'private' | 'unknown';

/**
 * Represents a file or directory in the filesystem system.
 */
export class FilesystemFile {
    public size: number = 0;
    public lastModified?: Date;

    /**
     * Visibility of the file.
     *
     * Note that some adapters might not support reading the visibility of a file.
     * In this case, the visibility is always 'private'.
     *
     * Some adapters might support reading the visibility per file, but not when listing files.
     * In this case you have to call additional `filesystem.get(file)` to load the visibility.
     */
    public visibility: FileVisibility = 'unknown';

    constructor(
        public path: string,
        public type: FileType = 'file',
    ) {
        this.path = pathNormalize(path);
    }

    /**
     * Returns true if this file is a symbolic link.
     */
    isFile(): boolean {
        return this.type === 'file';
    }

    /**
     * Returns true if this file is a directory.
     */
    isDirectory(): boolean {
        return this.type === 'directory';
    }

    /**
     * Returns the name (basename) of the file.
     */
    get name(): string {
        return pathBasename(this.path);
    }

    /**
     * Returns true if this file is in the given directory.
     *
     * /folder/file.txt => / => true
     * /folder/file.txt => /folder => true
     * /folder/file.txt => /folder/ => true
     *
     * /folder2/file.txt => /folder/ => false
     * /folder/file.txt => /folder/folder2 => false
     */
    inDirectory(directory: string): boolean {
        directory = pathNormalize(directory);
        if (directory === '/') return true;
        return (this.directory + '/').startsWith(directory + '/');
    }

    /**
     * Returns the directory (dirname) of the file.
     */
    get directory(): string {
        const lastSlash = this.path.lastIndexOf('/');
        return lastSlash <= 0 ? '/' : this.path.slice(0, lastSlash);
    }

    /**
     * Returns the extension of the file, or an empty string if not existing or a directory.
     */
    get extension(): string {
        if (!this.isFile()) return '';
        return pathExtension(this.path);
    }
}

export interface Operation<T> extends Promise<T> {
    /**
     * Adds a callback that is called when the progress changes.
     * Filesystem adapters might report progress on some operations,
     * like read/write content, read folder, copy, move, etc.
     *
     * The unit of loaded and total is not defined and depends on the adapter.
     * It might be bytes or the amount of files. if total=0, the total is unknown.
     */
    onProgress(callback: (loaded: number, total: number) => void): this;

    /**
     * When called the filesystem adapter tries to abort the operation.
     * This is not guaranteed to work, as some adapters might not support it.
     * When aborted, the promise will be rejected with an FilesystemOperationAborted error.
     */
    abort(): Promise<void>;

    /**
     * Returns true if the operation was aborted.
     */
    aborted: boolean;
}

export interface FilesystemAdapter {
    supportsVisibility(): boolean;

    supportsDirectory(): boolean;

    setVisibility?(path: string, visibility: FileVisibility): Promise<void>;

    /**
     * Closes the adapter (close connections, etc).
     */
    close?(): Promise<void>;

    /**
     * Returns all files (and directories) directly in the given folder.
     */
    files(path: string, reporter: Reporter): Promise<FilesystemFile[]>;

    /**
     * Returns all files (and directories) in the given folder and all sub folders.
     *
     * If the adapter does not support this, it will be emulated by calling files() recursively.
     */
    allFiles?(path: string, reporter: Reporter): Promise<FilesystemFile[]>;

    /**
     * Returns all directories directly in the given folder.
     */
    directories?(path: string, reporter: Reporter): Promise<FilesystemFile[]>;

    /**
     * Returns all directories in the given folder and all sub folders.
     *
     * If the adapter does not support this, it will be emulated by calling directories() recursively.
     */
    allDirectories?(path: string, reporter: Reporter): Promise<FilesystemFile[]>;

    /**
     * Creates a new directory and all parent directories if not existing.
     * Does nothing if the directory already exists.
     */
    makeDirectory(path: string, visibility: FileVisibility): Promise<void>;

    /**
     * Returns the public URL for the given path.
     *
     * For local filesystem it's the configured base URL + the path.
     * For adapters like S3 it's the public S3 URL to the file.
     */
    publicUrl?(path: string): string;

    /**
     * Writes the given contents to the given path.
     * Ensures that all parent directories exist.
     */
    write(path: string, contents: Uint8Array, visibility: FileVisibility, reporter: Reporter): Promise<void>;

    /**
     * Appends the given contents to the given file.
     *
     * Optional. If not implemented, the file will be read into memory, content appended, and then written.
     */
    append?(path: string, contents: Uint8Array, reporter: Reporter): Promise<void>;

    /**
     * Prepends the given contents to the given file.
     *
     * Optional. If not implemented, the file will be read into memory, content prepended, and then written.
     */
    prepend?(path: string, contents: Uint8Array, reporter: Reporter): Promise<void>;

    /**
     * Reads the contents of the given path.
     * @throws Error if the file does not exist.
     */
    read(path: string, reporter: Reporter): Promise<Uint8Array>;

    /**
     * Returns the file at the given path or undefined if not existing.
     */
    get(path: string): Promise<FilesystemFile | undefined>;

    /**
     * Returns true if all the given paths exist.
     */
    exists(path: string[]): Promise<boolean>;

    /**
     * Deletes all the given paths.
     * Throws an error if the file does not exist or the path is a directory.
     */
    delete(path: string[]): Promise<void>;

    /**
     * Deletes the directory at the given path and all files and directories in it recursively.
     * Does nothing if the directory does not exist.
     */
    deleteDirectory(path: string, reporter: Reporter): Promise<void>;

    /**
     * Copies the file from source to destination.
     * Ensures that all parent directories exist.
     * If source is a directory, it copies the directory recursively.
     *
     * If the adapter does not support copying file and directories, do not implement it. The Filesystem class emulates it by doing it manually.
     *
     * If the adapter only supports copying a file, implement moveFile.
     */
    copy?(source: string, destination: string, reporter: Reporter): Promise<void>;

    copyFile?(source: string, destination: string): Promise<void>;

    /**
     * Moves the file from source to destination.
     * Ensures that all parent directories exist.
     * If source is a directory, it moves the directory recursively.
     *
     * If the adapter does not support moving files and directories, do not implement it. The Filesystem class emulates it by doing it manually. read, write, then delete.
     *
     * If the adapter only supports moving a file, implement moveFile.
     */
    move?(source: string, destination: string, reporter: Reporter): Promise<void>;

    moveFile?(source: string, destination: string): Promise<void>;
}

/**
 * Generic FilesystemError. Base of all errors thrown by the Filesystem system.
 */
export class FilesystemError extends Error {
}

/**
 * Thrown when a file or directory does not exist.
 */
export class FilesystemFileNotFound extends FilesystemError {
}

/**
 * Thrown when an operation is aborted.
 */
export class FilesystemOperationAborted extends FilesystemError {
}

export type Reporter = { progress: (loaded: number, total: number) => void, onAbort: () => Promise<void>, aborted: boolean };

export function createProgress<T>(callback: (reporter: Reporter) => Promise<T>): Operation<T> {
    const callbacks: ((loaded: number, total: number) => void)[] = [];

    const reporter = {
        progress: (loaded: number, total: number) => {
            for (const callback of callbacks) callback(loaded, total);
        },
        onAbort: () => Promise.resolve(),
        aborted: false,
    };

    let reject: (error: Error) => void;
    const promise = asyncOperation<T>(async (resolve, _reject) => {
        reject = _reject;
        resolve(await callback(reporter));
    }) as Operation<T>;

    promise.onProgress = (callback: (loaded: number, total: number) => void) => {
        callbacks.push(callback);
        return promise;
    };

    promise.aborted = false;
    promise.abort = async () => {
        reporter.aborted = true;
        await reporter.onAbort();
        promise.aborted = true;
        reject(new FilesystemOperationAborted('Operation aborted'));
    };

    return promise;
}

export type FilesystemPath = string | FilesystemFile | string[];

export function resolveFilesystemPath(path: FilesystemPath): string {
    if (typeof path === 'string') return pathNormalize(path);
    if (Array.isArray(path)) {
        return '/' + path
            .map(v => pathNormalize(v).slice(1))
            .filter(v => !!v)
            .join('/');
    }
    return path.path;
}

export interface FilesystemOptions {
    /**
     * Default visibility for new files.
     */
    visibility: FileVisibility;

    /**
     * Default visibility for new directories.
     */
    directoryVisibility: FileVisibility;

    /**
     * Transforms a given path to a cleaned path (e.g. remove not allowed characters, remove whitespaces, etc).
     * Per default replaces all not allowed characters [^a-zA-Z0-9\.\-\_\/]) with a dash.
     */
    pathNormalizer: (path: string) => string;

    baseUrl?: string;

    /**
     * Transforms a given path to a public URL.
     */
    urlBuilder: (path: string) => string;
}

export class Filesystem {
    options: FilesystemOptions = {
        visibility: 'private',
        directoryVisibility: 'private',
        pathNormalizer: (path: string) => {
            return path.replace(/[^a-zA-Z0-9\.\-\_]/g, '-');
        },
        urlBuilder: (path: string) => {
            if (this.options.baseUrl) return this.options.baseUrl + path;
            return path;
        },
    };

    constructor(
        public adapter: FilesystemAdapter,
        options: Partial<FilesystemOptions> = {},
    ) {
        Object.assign(this.options, options);
        if (this.options.baseUrl?.endsWith('/')) this.options.baseUrl = this.options.baseUrl.slice(0, -1);
    }

    /**
     * Closes the adapter (close connections, etc).
     */
    async close() {
        if (this.adapter.close) await this.adapter.close();
    }

    /**
     * Reads a file from local file system.
     */
    async readLocalFile(path: string): Promise<Uint8Array | undefined> {
        return await readFile(path);
    }

    /**
     * Returns all files (and directories) directly in the given folder.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    files(path: FilesystemPath): Operation<FilesystemFile[]> {
        path = resolveFilesystemPath(path);
        return createProgress<FilesystemFile[]>(async (reporter) => {
            const files = await this.adapter.files(path as string, reporter);
            files.sort(compareFileSorting);
            return files;
        });
    }

    /**
     * Returns all files (and directories) paths in the given folder.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    fileNames(path: FilesystemPath): Operation<string[]> {
        path = resolveFilesystemPath(path);
        return createProgress<string[]>(async (reporter) => {
            //todo: some adapters might be able to do this more efficiently
            const files = await this.adapter.files(path as string, reporter);
            files.sort(compareFileSorting);
            return files.map(v => v.path);
        });
    }

    /**
     * Returns all files (and directories) in the given folder and all subfolders.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    allFiles(path: FilesystemPath): Operation<FilesystemFile[]> {
        path = resolveFilesystemPath(path);
        return createProgress<FilesystemFile[]>(async (reporter) => {
            if (this.adapter.allFiles) {
                const files = await this.adapter.allFiles(path as string, reporter);
                files.sort(compareFileSorting);
                return files;
            } else {
                // const files = await this.adapter.files(path as string, reporter);
                const result: FilesystemFile[] = [];
                const queue: string[] = [path as string];
                while (queue.length) {
                    const path = queue.shift()!;
                    const files = await this.adapter.files(path, reporter);
                    for (const file of files) {
                        result.push(file);
                        if (file.isDirectory()) {
                            queue.push(file.path);
                        }
                    }
                }
                result.sort(compareFileSorting);
                return result;
            }
        });
    }

    /**
     * Returns all files (and directories) paths in the given folder and all subfolders.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    allFileNames(path: FilesystemPath): Operation<string[]> {
        path = resolveFilesystemPath(path);
        return createProgress<string[]>(async (reporter) => {
            const files = await this.allFiles(path as string);
            files.sort(compareFileSorting);
            return files.map(v => v.path);
        });
    }

    /**
     * Returns all directories directly in the given folder.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    directories(path: FilesystemPath): Operation<FilesystemFile[]> {
        path = resolveFilesystemPath(path);
        return createProgress<FilesystemFile[]>(async (reporter) => {
            const directories = this.adapter.directories
                ? await this.adapter.directories(path as string, reporter)
                : (await this.adapter.files(path as string, reporter)).filter(v => v.isDirectory());
            directories.sort(compareFileSorting);
            return directories;
        });
    }

    /**
     * Returns all directories in the given folder and all subfolders.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    allDirectories(path: FilesystemPath): Operation<FilesystemFile[]> {
        path = resolveFilesystemPath(path);
        return createProgress<FilesystemFile[]>(async (reporter) => {
            if (this.adapter.allDirectories) {
                const directories = await this.adapter.allDirectories(path as string, reporter);
                directories.sort(compareFileSorting);
                return directories;
            } else {
                const files = await this.allFiles(path as string);
                return files.filter(v => v.isDirectory());
            }
        });
    }

    /**
     * Writes the given content to the given path.
     * Ensures that all parent directories exist.
     * Overwrites if already existing.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     */
    write(path: FilesystemPath, content: Uint8Array | string, visibility?: FileVisibility): Operation<void> {
        visibility = visibility || this.options.visibility;
        path = resolveFilesystemPath(path);
        const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        return createProgress<void>(async (reporter) => {
            return await this.adapter.write(path as string, buffer, visibility!, reporter);
        });
    }

    /**
     * Writes a given file reference (with path pointing to the file, e.g. UploadedFile) to the given directory.
     *
     * If no name is given, the basename of the file path is used.
     *
     * Returns the path to the saved file, so it can be used to store the path in a database.
     *
     * @example
     * ```typescript
     * filesystem.writeFile('uploads', uploadedFile);
     * filesystem.writeFile('uploads', uploadedFile, {name: user.id});
     * ```
     */
    async writeFile(directory: string, file: { path: string }, options: { name?: string, visibility?: FileVisibility } = {}): Promise<string> {
        const path = (options.name ? options.name : pathBasename(file.path));
        const content = await this.readLocalFile(file.path);
        if (!content) throw new FilesystemError(`Can not write file, since ${file.path} not found`);

        const targetPath = resolveFilesystemPath([directory, path]);
        await this.write(targetPath, content, options.visibility);
        return targetPath;
    }

    /**
     * Appends the given content to the given file.
     *
     * Warning: On many filesystem adapters this loads the whole file first into memory.
     */
    append(path: FilesystemPath, content: Uint8Array | string): Operation<void> {
        path = resolveFilesystemPath(path);
        const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        return createProgress<void>(async (reporter) => {
            if (this.adapter.append) return await this.adapter.append(path as string, buffer, reporter);

            const file = await this.get(path);
            const existing = await this.read(path);
            return await this.adapter.write(path as string, Buffer.concat([existing, buffer]), file.visibility, reporter);
        });
    }

    /**
     * Prepends the given content to the given file.
     *
     * Warning: On almost all filesystem adapters this loads the whole file first into memory.
     */
    prepend(path: FilesystemPath, content: Uint8Array | string): Operation<void> {
        path = resolveFilesystemPath(path);
        const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : content;
        return createProgress<void>(async (reporter) => {
            if (this.adapter.prepend) return await this.adapter.prepend(path as string, buffer, reporter);

            const file = await this.get(path);
            const existing = await this.read(path);
            return await this.adapter.write(path as string, Buffer.concat([buffer, existing]), file.visibility, reporter);
        });
    }

    /**
     * Reads the contents of the given path as binary.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     *
     * @throws Error if the file does not exist.
     */
    read(path: FilesystemPath): Operation<Uint8Array> {
        path = resolveFilesystemPath(path);
        return createProgress<Uint8Array>(async (reporter) => {
            return await this.adapter.read(path as string, reporter);
        });
    }

    /**
     * Reads the contents of the given path as string.
     *
     * Returns a Progress object that can be used to track the progress of the operation.
     *
     * @throws Error if the file does not exist.
     */
    readAsText(path: FilesystemPath): Operation<string> {
        path = resolveFilesystemPath(path);
        return createProgress<string>(async (reporter) => {
            const contents = await this.adapter.read(path as string, reporter);
            return new TextDecoder().decode(contents);
        });
    }

    /**
     * Returns the file at the given path.
     *
     * @throws FilesystemFileNotFound if the file does not exist.
     */
    async get(path: FilesystemPath): Promise<FilesystemFile> {
        path = resolveFilesystemPath(path);
        const file = await this.adapter.get(path);
        if (!file) throw new FilesystemFileNotFound('File not found');
        return file;
    }

    /**
     * Returns the file at the given path or undefined if not existing.
     */
    getOrUndefined(path: FilesystemPath): Promise<FilesystemFile | undefined> {
        path = resolveFilesystemPath(path);
        return this.adapter.get(path);
    }

    /**
     * Returns true if all the given paths exist.
     */
    exists(path: FilesystemPath | FilesystemPath[]): Promise<boolean> {
        const paths = (Array.isArray(path) ? path : [path]).map(v => resolveFilesystemPath(v));
        return this.adapter.exists(paths);
    }

    /**
     * Deletes all the given paths.
     * Does nothing if the file does not exist.
     *
     * Throws an error if the path is not a file.
     */
    async delete(path: FilesystemPath | FilesystemPath[]): Promise<void> {
        const paths = (Array.isArray(path) ? path : [path]).map(v => resolveFilesystemPath(v));
        await this.adapter.delete(paths);
    }

    /**
     * Deletes the directory at the given path and all files and directories in it recursively.
     */
    deleteDirectory(path: FilesystemPath): Operation<void> {
        path = resolveFilesystemPath(path);
        return createProgress<void>(async (reporter) => {
            return this.adapter.deleteDirectory(path as string, reporter);
        });
    }

    /**
     * Copies the file or directory from source to destination, recursively.
     */
    copy(source: FilesystemPath, destination: FilesystemPath): Operation<void> {
        source = resolveFilesystemPath(source);
        destination = resolveFilesystemPath(destination);
        return createProgress<void>(async (reporter) => {
            if (source === destination) return;

            if (this.adapter.copy) {
                return this.adapter.copy(source as string, destination as string, reporter);
            } else {
                const file = await this.get(source);
                const queue: { file: FilesystemFile, targetPath: string }[] = [
                    { file, targetPath: destination as string },
                ];
                while (queue.length) {
                    const entry = queue.shift()!;
                    if (entry.file.isDirectory()) {
                        const files = await this.files(entry.file.path);
                        for (const file of files) {
                            queue.push({ file, targetPath: pathJoin(entry.targetPath, file.name) });
                        }
                    } else {
                        await this.adapter.write(entry.targetPath, await this.adapter.read(entry.file.path, reporter), entry.file.visibility, reporter);
                    }
                }
            }
        });
    }

    /**
     * Moves the file or directory from source to destination, recursively.
     *
     * This might or might not be an atomic operation. If the adapter does not support moving,
     * it will emulate it by doing it manually by copying and then deleting. While it copies,
     * the source file keeps existing, so it's not atomic. If the process crashes, the source
     * and destination might be in an inconsistent state.
     */
    move(source: FilesystemPath, destination: FilesystemPath): Operation<void> {
        source = resolveFilesystemPath(source);
        destination = resolveFilesystemPath(destination);

        return createProgress<void>(async (reporter) => {
            if (source === destination) return;

            if (this.adapter.move) {
                return this.adapter.move(source as string, destination as string, reporter);
            } else if (this.adapter.moveFile) {
                const file = await this.get(source);
                const queue: { file: FilesystemFile, targetPath: string }[] = [
                    { file, targetPath: destination as string },
                ];
                while (queue.length) {
                    const entry = queue.shift()!;
                    if (entry.file.isDirectory()) {
                        const files = await this.files(entry.file.path);
                        for (const file of files) {
                            queue.push({ file, targetPath: pathJoin(entry.targetPath, file.name) });
                        }
                    } else {
                        await this.adapter.moveFile(entry.file.path, entry.targetPath);
                    }
                }
            } else {
                await this.copy(source, destination);
                const file = await this.get(source);
                if (file.isDirectory()) {
                    await this.deleteDirectory(source);
                } else {
                    await this.delete(source);
                }
            }
        });
    }

    /**
     * Creates a new directory, and all parent directories if not existing.
     */
    makeDirectory(path: FilesystemPath, visibility?: FileVisibility): Promise<void> {
        visibility = visibility || this.options.directoryVisibility;
        path = resolveFilesystemPath(path);
        return this.adapter.makeDirectory(path, visibility);
    }

    /**
     * Returns the public URL for the given path.
     */
    publicUrl(path: FilesystemPath): string {
        path = resolveFilesystemPath(path);
        if (this.adapter.publicUrl) return this.adapter.publicUrl(path);

        return this.options.urlBuilder(path);
    }

    /**
     * Sets the visibility of the given path.
     */
    async setVisibility(path: FilesystemPath, visibility: FileVisibility): Promise<void> {
        if (!this.adapter.setVisibility) return;
        await this.adapter.setVisibility(resolveFilesystemPath(path), visibility);
    }
}

/**
 * A sorting comparator for FilesystemFile that sorts directories first, then by path.
 */
export function compareFileSorting(a: FilesystemFile, b: FilesystemFile): number {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.path.localeCompare(b.path);
}

export function pathDirectories(path: string): string [] {
    path = pathNormalize(path);
    if (path === '/') return [];
    const directories: string[] = [];
    for (const part of path.split('/')) {
        if (!part) continue;
        if (directories.length === 0) {
            directories.push('/' + part);
        } else {
            directories.push(directories[directories.length - 1] + '/' + part);
        }
    }
    return directories;
}

export type NamedFilesystem<Name extends string> = Filesystem & Inject<`app.filesystem.${Name}`>;

/**
 * Creates a provider for Deepkit App to provide a Filesystem instance.
 *
 * If a function is given as adapter, it will be called once when the filesystem is created.
 * The function can have additional dependencies defined as parameters that will be resolved, e.g. configuration options.
 *
 * @example
 * ```typescript
 * import { provideNamedFilesystem, NamedFilesystem, FilesystemLocalAdapter } from '@deepkit/filesystem';
 * import { AppModule } from '@deepkit/app';
 *
 * new App({
 *     providers: [provideNamedFilesystem('local2', new FilesystemLocalAdapter({root: 'public'}))]
 * }).command('test', (filesystem: NamedFilesystem<'local2'>) => {});
 * ```
 */
export function provideNamedFilesystem(name: string, adapter: FilesystemAdapter | (() => FilesystemAdapter), options: Partial<FilesystemOptions> = {}) {
    const filesystemId = 'app.filesystem.' + name;
    const adapterId = `${filesystemId}.adapter`;

    const adapterProvider = {
        provide: adapterId,
        useFactory: isFunction(adapter) ? adapter : () => adapter,
    };

    const token = name === 'default' ? Filesystem : filesystemId;

    const filesystemProvider = {
        provide: token,
        useFactory: (adapter: FilesystemAdapter & Inject<typeof adapterId>) => {
            return new Filesystem(adapter, options);
        },
    };

    return [adapterProvider, filesystemProvider];
}

/**
 * Creates a provider for Deepkit App to provide a default Filesystem instance,
 * that can be received or injected via `Filesystem` class.
 *
 * @example
 * ```typescript
 * import { provideFilesystem, Filesystem, FilesystemLocalAdapter } from '@deepkit/filesystem';
 * import { AppModule } from '@deepkit/app';
 *
 * new App({
 *     providers: [provideFilesystem(new FilesystemLocalAdapter({root: 'public'}))]
 * }).command('test', (filesystem: Filesystem) => {});
 * ```
 *
 * @see provideNamedFilesystem
 */
export function provideFilesystem(adapter: FilesystemAdapter | (() => FilesystemAdapter), options: Partial<FilesystemOptions> = {}) {
    return provideNamedFilesystem('default', adapter, options);
}
