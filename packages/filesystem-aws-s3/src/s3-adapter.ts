import { FilesystemAdapter, FilesystemError, FilesystemFile, FileVisibility, Reporter } from '@deepkit/filesystem';
import { pathDirectory, pathNormalize } from '@deepkit/core';
import {
    CopyObjectCommand,
    DeleteObjectsCommand,
    GetObjectAclCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsCommand,
    ObjectCannedACL,
    PutObjectAclCommand,
    PutObjectCommand,
    S3Client,
    S3ClientConfigType,
} from '@aws-sdk/client-s3';

export interface FilesystemAwsS3Options extends S3ClientConfigType {
    bucket: string;
    path?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;

    /**
     * Use path-style URLs (http://endpoint/bucket/key) instead of virtual-hosted style.
     * Required for most S3-compatible services (MinIO, S3Mock, ...).
     */
    forcePathStyle?: boolean;

    /**
     * If enabled, the adapter will create directories when writing files.
     *
     * Default: true
     */
    directoryEmulation?: boolean;
}

export class FilesystemAwsS3Adapter implements FilesystemAdapter {
    client: S3Client;

    constructor(public options: FilesystemAwsS3Options) {
        this.client = new S3Client({
            region: options.region,
            credentials: {
                accessKeyId: options.accessKeyId,
                secretAccessKey: options.secretAccessKey,
            },
            endpoint: options.endpoint,
            forcePathStyle: options.forcePathStyle,
        });
    }

    supportsVisibility() {
        return true;
    }

    supportsDirectory() {
        return this.options.directoryEmulation === true;
    }

    /**
     * Key prefix for `options.path`, without leading slash (S3 keys must not start with `/`).
     */
    protected getBasePath(): string {
        return this.options.path ? pathNormalize(this.options.path).slice(1) + '/' : '';
    }

    protected getRemotePath(path: string) {
        path = pathNormalize(path);
        const base = this.getBasePath();
        if (path === '/') return base;
        let remotePath = this.options.path ? base : '';
        remotePath += path === '/' ? '' : path.slice(1);
        return remotePath;
    }

    protected getRemoteDirectory(path: string) {
        path = this.getRemotePath(path);
        return path.endsWith('/') ? path : path + '/';
    }

    protected pathMapToVirtual(path: string): string {
        //remove this.options.path from path
        return path.slice(this.getBasePath().length);
    }

    publicUrl(path: string): string {
        return `https://${this.options.bucket}.s3.${this.options.region}.amazonaws.com/${this.getRemotePath(path)}`;
    }

    protected visibilityToAcl(visibility: FileVisibility): ObjectCannedACL {
        if (visibility === 'public') return 'public-read';
        return 'private';
    }

    protected aclToVisibility(grants: any[]): FileVisibility {
        for (const grant of grants) {
            if (grant.Permission === 'READ' && grant.Grantee.URI === 'http://acs.amazonaws.com/groups/global/AllUsers') {
                return 'public';
            }
        }

        return 'private';
    }

    async makeDirectory(path: string, visibility: FileVisibility): Promise<void> {
        if (path === '') return;

        const command = new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: this.getRemoteDirectory(path),
            ContentLength: 0,
            ACL: this.visibilityToAcl(visibility),
        });

        try {
            await this.client.send(command);
        } catch (error: any) {
            // that's fine
        }
    }

    async files(path: string): Promise<FilesystemFile[]> {
        return await this.getFiles(path, false);
    }

    async allFiles(path: string, reporter: Reporter): Promise<FilesystemFile[]> {
        return await this.getFiles(path, true);
    }

    protected async getFiles(path: string, recursive: boolean = false): Promise<FilesystemFile[]> {
        const files: FilesystemFile[] = [];
        const remotePath = this.getRemoteDirectory(path);

        const command = new ListObjectsCommand({
            Bucket: this.options.bucket,
            Prefix: remotePath,
            Delimiter: recursive ? undefined : '/',
        });

        try {
            const response = await this.client.send(command);

            if (response.CommonPrefixes) {
                for (const prefix of response.CommonPrefixes) {
                    if (!prefix.Prefix) continue;
                    const file = new FilesystemFile(this.pathMapToVirtual(prefix.Prefix));
                    file.type = 'directory';
                    files.push(file);
                }
            }

            if (response.Contents) {
                for (const content of response.Contents) {
                    if (!content.Key) continue;
                    // AWS sends the folder itself, we ignore that
                    if (content.Key === remotePath) continue;

                    const file = new FilesystemFile(this.pathMapToVirtual(content.Key));
                    file.size = content.Size || 0;
                    file.lastModified = content.LastModified;
                    file.type = content.Key.endsWith('/') ? 'directory' : 'file';
                    files.push(file);
                }
            }
        } catch (error: any) {
            throw new FilesystemError(`Could not list files ${path}: ${error.message}`);
        }

        return files;
    }

    async copy(source: string, destination: string, reporter: Reporter): Promise<void> {
        const file = await this.get(source);

        if (file && file.isFile()) {
            if (this.supportsDirectory()) {
                await this.makeDirectory(pathDirectory(destination), file.visibility);
            }

            const command = new CopyObjectCommand({
                Bucket: this.options.bucket,
                Key: this.getRemotePath(destination),
                CopySource: this.options.bucket + '/' + this.getRemotePath(source),
            });

            try {
                await this.client.send(command);
            } catch (error: any) {
                throw new FilesystemError(`Could not copy file ${source} to ${destination}: ${error.message}`);
            }
        } else {
            //get all files, copy them
            const files = await this.allFiles(source, reporter);
            for (const file of files) {
                if (file.isDirectory()) continue;

                const from = this.options.bucket + '/' + this.getRemotePath(file.path);
                const to = this.getRemotePath(destination) + '/' + file.path.slice(source.length + 1);
                const command = new CopyObjectCommand({
                    Bucket: this.options.bucket,
                    Key: to,
                    CopySource: from,
                });

                try {
                    await this.client.send(command);
                } catch (error: any) {
                    throw new FilesystemError(`Could not copy file ${source} to ${destination}: ${error.message}`);
                }
            }
        }
    }

    async delete(paths: string[]): Promise<void> {
        const command = new DeleteObjectsCommand({
            Bucket: this.options.bucket,
            Delete: {
                Objects: paths.map(v => ({ Key: this.getRemotePath(v) })) || [],
            }
        });

        try {
            await this.client.send(command);
        } catch (error: any) {
            // that's fine
        }
    }

    async deleteDirectory(path: string, reporter: Reporter): Promise<void> {
        const files = await this.client.send(new ListObjectsCommand({
            Bucket: this.options.bucket,
            Prefix: this.getRemoteDirectory(path),
        }));

        if (!files.Contents) return;

        const command = new DeleteObjectsCommand({
            Bucket: this.options.bucket,
            Delete: {
                Objects: files.Contents.map(v => ({ Key: v.Key })) || [],
            }
        });

        try {
            await this.client.send(command);
        } catch (error: any) {
            // that's fine
        }
    }

    async exists(paths: string[]): Promise<boolean> {
        for (const path of paths) {
            if (!await this.existsSingle(path)) return false;
        }
        return true;
    }

    protected async existsSingle(path: string): Promise<boolean> {
        const command = new HeadObjectCommand({
            Bucket: this.options.bucket,
            Key: this.getRemotePath(path),
        });

        try {
            const response = await this.client.send(command);
            return true;
        } catch (error: any) {
            return false;
        }
    }

    async get(path: string): Promise<FilesystemFile | undefined> {
        const file = new FilesystemFile(path);
        const remotePath = this.getRemotePath(path);

        const command = new GetObjectCommand({
            Bucket: this.options.bucket,
            Key: remotePath,
        });
        try {
            const response = await this.client.send(command);
            file.size = response.ContentLength || 0;
            file.lastModified = response.LastModified;
            file.visibility = await this.getVisibility(path);
        } catch (error: any) {
            return undefined;
        }

        return file;
    }

    async move(source: string, destination: string, reporter: Reporter): Promise<void> {
        await this.copy(source, destination, reporter);
        await this.delete([source]);
        await this.deleteDirectory(source, reporter);
    }

    async read(path: string, reporter: Reporter): Promise<Uint8Array> {
        const remotePath = this.getRemotePath(path);

        const command = new GetObjectCommand({
            Bucket: this.options.bucket,
            Key: remotePath,
        });

        try {
            const response = await this.client.send(command);
            if (!response.Body) throw new FilesystemError(`Could not read file ${path}: No body in response`);
            return await response.Body.transformToByteArray();
        } catch (error: any) {
            throw new FilesystemError(`Could not read file ${path}: ${error.message}`);
        }
    }

    async write(path: string, contents: Uint8Array, visibility: FileVisibility, reporter: Reporter): Promise<void> {
        if (this.supportsDirectory()) {
            await this.makeDirectory(pathDirectory(path), visibility);
        }

        const remotePath = this.getRemotePath(path);
        const command = new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: remotePath,
            Body: contents,
            ACL: this.visibilityToAcl(visibility),
        });

        try {
            await this.client.send(command);
        } catch (error: any) {
            throw new FilesystemError(`Could not write file ${path}: ${error.message}`);
        }
    }

    async getVisibility(path: string): Promise<FileVisibility> {
        const remotePath = this.getRemotePath(path);
        const aclCommand = new GetObjectAclCommand({
            Bucket: this.options.bucket,
            Key: remotePath,
        });

        try {
            const response = await this.client.send(aclCommand);
            return this.aclToVisibility(response.Grants || []);
        } catch (error: any) {
            throw new FilesystemError(`Could not get visibility for ${path}: ${error.message}`);
        }
    }

    async setVisibility(path: string, visibility: FileVisibility): Promise<void> {
        const remotePath = this.getRemotePath(path);
        const command = new PutObjectAclCommand({
            Bucket: this.options.bucket,
            Key: remotePath,
            ACL: this.visibilityToAcl(visibility),
        });

        try {
            await this.client.send(command);
        } catch (error: any) {
            throw new FilesystemError(`Could not set visibility for ${path}: ${error.message}`);
        }
    }
}
