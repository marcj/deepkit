import { Socket, connect as connectNet } from 'net';
import { TLSSocket, connect as connectTls } from 'tls';

import { PoolableConnection, RequestQueue } from '@deepkit/net';
import { SocketWriter, connectSocket } from '@deepkit/net/node';
import { LruCache, maxPreparedStatementLength } from '@deepkit/sql';

import { ScramClient, md5Password } from './auth.js';
import { CompiledBind, compileBind } from './bind-encoder.js';
import { PostgresEncoder, emptyName, textResultFormats } from './encoder.js';
import { PostgresConnectionError, PostgresError, parseErrorResponse } from './errors.js';
import { PostgresFrameReader, PostgresMessageHandler } from './frame-reader.js';
import { ResolvedPostgresOptions } from './options.js';
import { PostgresColumn, RowDecoder, RowMode, RowShape, decodeText, getRowShape } from './row-decoder.js';

const enum Phase {
    connecting,
    ready,
    closed,
}

const noop = () => undefined;
const readBufferSize = 64 * 1024;
const idleStatus = 73; // I
const maxFreeRequests = 256;

function int32(d: Uint8Array, o: number): number {
    return (d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
}

/** The row count at the end of a command tag like "INSERT 0 5" or "SELECT 3", null when it has none. */
function parseRowCount(d: Uint8Array, start: number, end: number): number | null {
    let i = end - 1;
    if (i < start || d[i] < 48 || d[i] > 57) return null;
    let value = 0;
    let scale = 1;
    while (i >= start && d[i] >= 48 && d[i] <= 57) {
        value += (d[i] - 48) * scale;
        scale *= 10;
        i--;
    }
    return i >= start && d[i] === 32 ? value : null;
}

export interface QueryResult {
    /** undefined when several statements were executed at once, the same as rowCount. */
    rows: any[];
    rowCount: number | null;
    fields: PostgresColumn[];
}

const emptyColumns: PostgresColumn[] = [];

const enum Resolution {
    result,
    rows,
    /** The first row, undefined if there is none. */
    row,
    rowCount,
}

/**
 * The state of one query, which is reused. Everything a query needs lives in this object so that the
 * only allocation of a query below the Promise of its caller is the result.
 */
class QueryRequest {
    resolve: (value: any) => void = noop;
    reject: (error: any) => void = noop;
    /** Created once, so that no function is created per query. */
    readonly executor = (resolve: (value: any) => void, reject: (error: any) => void) => {
        this.resolve = resolve;
        this.reject = reject;
    };

    sql: string = '';
    params: any[] | undefined = undefined;
    statement: PreparedStatement | undefined = undefined;
    decode: RowDecoder | undefined = undefined;
    shape: RowShape | undefined = undefined;
    mode: RowMode = RowMode.object;
    resolution: Resolution = Resolution.result;
    rows: any[] | undefined = undefined;
    rowCount: number | null = null;
    commands: number = 0;
    error: any = undefined;
    retried: boolean = false;
    /** The Parse of the statement was sent with this request. */
    parsed: boolean = false;
    parseConfirmed: boolean = false;
    abandoned: boolean = false;
    deadline: number = 0;
    /** The parts of a batch sharing one Sync, this is then their root and only sent as one. */
    items: QueryRequest[] | undefined = undefined;
    index: number = 0;
    copy: Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array> | undefined = undefined;

    reset(): void {
        this.resolve = noop;
        this.reject = noop;
        this.sql = '';
        this.params = undefined;
        this.statement = undefined;
        this.decode = undefined;
        this.shape = undefined;
        this.rows = undefined;
        this.rowCount = null;
        this.commands = 0;
        this.error = undefined;
        this.retried = false;
        this.parsed = false;
        this.parseConfirmed = false;
        this.abandoned = false;
        this.deadline = 0;
        this.items = undefined;
        this.index = 0;
        this.copy = undefined;
    }
}

class PreparedStatement {
    parsed: boolean = false;
    shape: RowShape | undefined = undefined;
    /** A statement like INSERT without RETURNING, which is not described again. */
    noData: boolean = false;
    forgotten: boolean = false;
    /** Types of the parameters, reported by the server. */
    parameterTypes: number[] | undefined = undefined;
    bind: CompiledBind | undefined = undefined;
    readonly nameBytes: Uint8Array;

    constructor(
        readonly sql: string,
        name: string,
    ) {
        this.nameBytes = new Uint8Array(name.length + 1);
        for (let i = 0; i < name.length; i++) this.nameBytes[i] = name.charCodeAt(i);
    }
}

function isStaleStatementError(error: any): boolean {
    return error.code === '26000' || (error.code === '0A000' && String(error.message).includes('cached plan'));
}

/**
 * Opens a socket and negotiates TLS. Only for connections that are not used for pipelining.
 */
function openTransport(
    options: ResolvedPostgresOptions,
    onSocket?: (socket: Socket) => void,
): Promise<Socket | TLSSocket> {
    return new Promise((resolve, reject) => {
        const raw = options.socketPath
            ? connectNet({ path: options.socketPath })
            : connectNet({ host: options.host, port: options.port, noDelay: true });
        if (onSocket) onSocket(raw);
        raw.once('error', reject);
        raw.once('connect', () => {
            if (!options.ssl) {
                raw.removeListener('error', reject);
                resolve(raw);
                return;
            }
            const request = Buffer.alloc(8);
            request.writeInt32BE(8, 0);
            request.writeInt32BE(80877103, 4);
            raw.write(request);
            raw.once('data', data => {
                raw.removeListener('error', reject);
                if (data[0] !== 83) {
                    raw.destroy();
                    reject(new PostgresConnectionError('The server does not support SSL connections'));
                    return;
                }
                const socket = connectTls({ ...options.ssl, socket: raw });
                socket.once('error', reject);
                socket.once('secureConnect', () => {
                    socket.removeListener('error', reject);
                    resolve(socket);
                });
            });
        });
    });
}

export class PostgresClientConnection implements PoolableConnection, PostgresMessageHandler {
    load: number = 0;
    exclusive: boolean = false;
    idleSince: number = 0;

    /** Server settings the server reported, like server_version or TimeZone. */
    readonly parameters = new Map<string, string>();
    onNotice?: (notice: PostgresError) => void;
    onNotification?: (channel: string, payload: string, pid: number) => void;

    protected phase: Phase = Phase.connecting;
    protected socket!: Socket | TLSSocket;
    protected writer!: SocketWriter;
    protected reader: PostgresFrameReader;
    protected inFlight = new RequestQueue<QueryRequest>();
    /** The request the next row belongs to: the head of inFlight, or the current item of a batch. */
    protected current: QueryRequest | undefined = undefined;
    protected free: QueryRequest[] = [];
    protected statements?: LruCache<PreparedStatement>;
    protected statementId: number = 0;
    protected pendingCloses: Uint8Array[] = [];
    protected fatalError?: Error;

    protected backendPid: number = 0;
    protected backendSecret: number = 0;
    /** I for idle, T in a transaction, E in a failed transaction. */
    transactionStatus: number = idleStatus;

    protected connectResolve: () => void = noop;
    protected connectReject: (error: Error) => void = noop;
    protected connectPromise: Promise<void>;
    protected connectTimer?: ReturnType<typeof setTimeout>;
    protected scram?: ScramClient;

    constructor(
        protected options: ResolvedPostgresOptions,
        protected encoder: PostgresEncoder,
        protected onClose: (connection: PostgresClientConnection) => void,
        maxPreparedStatements: number,
    ) {
        this.reader = new PostgresFrameReader(this.onMessage.bind(this), this);
        if (maxPreparedStatements > 0) {
            this.statements = new LruCache(maxPreparedStatements, (key, statement) =>
                this.forgetStatement(statement, true),
            );
        }
        this.connectPromise = new Promise<void>((resolve, reject) => {
            this.connectResolve = resolve;
            this.connectReject = reject;
        });
        if (options.connectionTimeoutMillis > 0) {
            this.connectTimer = setTimeout(() => {
                this.fail(
                    new PostgresConnectionError(`Connection timed out after ${options.connectionTimeoutMillis}ms`),
                );
            }, options.connectionTimeoutMillis);
            this.connectTimer.unref?.();
        }
        this.open();
    }

    protected open(): void {
        const options = this.options;
        if (options.ssl || options.socketPath) {
            // kept for the connect timeout, which destroys it while negotiating
            openTransport(options, raw => (this.socket = raw))
                .then(socket => {
                    if (this.phase === Phase.closed) {
                        socket.destroy();
                        return;
                    }
                    this.attach(socket);
                    socket.on('data', (data: Uint8Array) => this.onData(data, data.byteLength));
                    this.sendStartup();
                })
                .catch(error => this.fail(this.connectionError(error)));
            return;
        }

        const socket = connectSocket(
            {
                host: options.host,
                port: options.port,
                readBufferSize,
            },
            (data, length) => this.onData(data, length),
        );
        this.attach(socket);
        socket.once('connect', () => this.sendStartup());
    }

    protected attach(socket: Socket | TLSSocket): void {
        this.socket = socket;
        this.writer = new SocketWriter(socket);
        if (this.options.keepAlive) socket.setKeepAlive(true, this.options.keepAliveInitialDelayMillis);
        socket.on('error', error => this.closeWith(this.connectionError(error)));
        socket.on('close', () => this.closeWith(this.fatalError || new PostgresConnectionError('Connection closed')));
    }

    protected connectionError(cause: any): PostgresConnectionError {
        if (cause instanceof PostgresConnectionError) return cause;
        const error = new PostgresConnectionError(`Connection error: ${cause?.message ?? cause}`, { cause });
        if (cause?.code) error.code = cause.code;
        return error;
    }

    connect(): Promise<void> {
        return this.connectPromise;
    }

    isConnected(): boolean {
        return this.phase === Phase.ready;
    }

    /** True while the connection has an open or failed transaction. */
    inTransaction(): boolean {
        return this.transactionStatus !== idleStatus;
    }

    protected onData(data: Uint8Array, length: number): void {
        try {
            this.reader.feed(data, length);
        } catch (error) {
            this.fail(this.connectionError(error));
        }
    }

    /** The stream can not be trusted anymore, or the connection is not wanted: everything still waiting fails. */
    protected fail(error: Error): void {
        if (this.phase === Phase.closed) return;
        this.closeWith(error);
        this.socket?.destroy();
    }

    protected closeWith(error: Error): void {
        if (this.phase === Phase.closed) return;
        this.phase = Phase.closed;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.connectReject(error);
        this.connectResolve = noop;
        this.connectReject = noop;

        this.current = undefined;
        while (this.inFlight.size > 0) {
            const request = this.inFlight.shift()!;
            const reject = request.reject;
            reject(request.error || error);
        }
        this.onClose(this);
    }

    close(): void {
        if (this.phase === Phase.closed) return;
        const socket = this.socket;
        const graceful = this.phase === Phase.ready && socket && !socket.destroyed;
        if (graceful) {
            const encoder = this.encoder;
            encoder.reset();
            encoder.writeTerminate();
            this.flush();
            this.writer.flush();
        }
        this.closeWith(new PostgresConnectionError('Connection closed'));
        if (graceful) socket.end();
        else socket?.destroy();
    }

    protected flush(): void {
        const encoder = this.encoder;
        if (this.writer.writeRange(encoder.memory, 0, encoder.size)) {
            encoder.replaceBuffer();
        } else {
            encoder.releaseIfLarge();
        }
    }

    protected sendStartup(): void {
        const encoder = this.encoder;
        encoder.reset();
        encoder.writeStartup(this.options.startupParameters);
        this.flush();
    }

    protected async sendPassword(transform?: (password: string) => string): Promise<void> {
        const password = await this.resolvePassword();
        const encoder = this.encoder;
        encoder.reset();
        encoder.writePasswordMessage(transform ? transform(password) : password);
        this.flush();
    }

    protected async resolvePassword(): Promise<string> {
        const password = this.options.password;
        const value = 'function' === typeof password ? await password() : password;
        if ('string' !== typeof value)
            throw new PostgresConnectionError('The server requires a password, but none was configured');
        return value;
    }

    protected authenticationFailed = (error: any): void => {
        this.fail(error instanceof PostgresError ? error : this.connectionError(error));
    };

    protected onAuthentication(data: Uint8Array, start: number, end: number): void {
        const body = start + 9;
        switch (int32(data, start + 5)) {
            case 0:
                return;
            case 3:
                this.sendPassword().catch(this.authenticationFailed);
                return;
            case 5: {
                const salt = data.slice(body, body + 4);
                this.sendPassword(password => md5Password(this.options.user, password, salt)).catch(
                    this.authenticationFailed,
                );
                return;
            }
            case 10: {
                // a list of zero terminated names, ended by an empty one
                let offset = body;
                let supported = false;
                while (offset < end && data[offset] !== 0) {
                    let stop = offset;
                    while (data[stop] !== 0) stop++;
                    if (decodeText(data, offset, stop) === 'SCRAM-SHA-256') supported = true;
                    offset = stop + 1;
                }
                if (!supported) {
                    this.fail(
                        new PostgresConnectionError(
                            'The server asked for a SASL mechanism that is not supported, only SCRAM-SHA-256 is',
                        ),
                    );
                    return;
                }
                const scram = (this.scram = new ScramClient());
                const encoder = this.encoder;
                encoder.reset();
                encoder.writeSaslInitialResponse(scram.mechanism, scram.clientFirst);
                this.flush();
                return;
            }
            case 11: {
                const serverFirst = decodeText(data, body, end);
                this.resolvePassword()
                    .then(password => this.scram!.clientFinal(serverFirst, password))
                    .then(response => {
                        const encoder = this.encoder;
                        encoder.reset();
                        encoder.writeSaslResponse(response);
                        this.flush();
                    })
                    .catch(this.authenticationFailed);
                return;
            }
            case 12: {
                try {
                    this.scram!.verifyServerFinal(decodeText(data, body, end));
                } catch (error) {
                    this.authenticationFailed(error);
                }
                return;
            }
        }
        this.fail(
            new PostgresConnectionError(
                `The server asked for an authentication method that is not supported: ${int32(data, start + 5)}`,
            ),
        );
    }

    protected onStartupMessage(data: Uint8Array, start: number, end: number): void {
        switch (data[start]) {
            case 82: // R, authentication
                this.onAuthentication(data, start, end);
                break;
            case 83: // S, parameter status
                this.onParameterStatus(data, start, end);
                break;
            case 75: // K, backend key data
                this.backendPid = int32(data, start + 5);
                this.backendSecret = int32(data, start + 9);
                break;
            case 90: {
                // Z, ready for query
                if (this.connectTimer) clearTimeout(this.connectTimer);
                this.transactionStatus = data[start + 5];
                this.phase = Phase.ready;
                const resolve = this.connectResolve;
                this.connectResolve = noop;
                this.connectReject = noop;
                resolve();
                break;
            }
            case 69: // E
                this.fail(parseErrorResponse(data, start + 5, end));
                break;
            case 78: // N
                this.onNoticeMessage(data, start, end);
                break;
        }
    }

    protected onParameterStatus(data: Uint8Array, start: number, end: number): void {
        let stop = start + 5;
        while (data[stop] !== 0) stop++;
        this.parameters.set(decodeText(data, start + 5, stop), decodeText(data, stop + 1, end - 1));
    }

    protected onNoticeMessage(data: Uint8Array, start: number, end: number): void {
        if (this.onNotice) this.onNotice(parseErrorResponse(data, start + 5, end));
    }

    /** The request whose reply is next, the first item for a batch. */
    protected headTarget(): QueryRequest | undefined {
        const head = this.inFlight.at(0);
        return head && head.items ? head.items[0] : head;
    }

    protected onMessage(data: Uint8Array, start: number, end: number): void {
        if (this.phase !== Phase.ready) {
            this.onStartupMessage(data, start, end);
            return;
        }

        switch (data[start]) {
            case 68: // D, data row
                this.onDataRow(data, start);
                break;
            case 50: // 2, bind complete
            case 110: // n, no data
                if (data[start] === 110) {
                    const statement = this.current!.statement;
                    if (statement !== undefined) statement.noData = true;
                }
                break;
            case 49: // 1, parse complete
                this.current!.parseConfirmed = true;
                break;
            case 67: // C, command complete
                this.onCommandComplete(data, start, end);
                break;
            case 73: // I, empty query
                this.advanceBatch(this.current!);
                break;
            case 90: // Z, ready for query
                this.onReadyForQuery(data, start);
                break;
            case 84: {
                // T, row description
                const request = this.current!;
                const shape = getRowShape(data, start + 5, end);
                request.shape = shape;
                request.decode = shape.decoder(request.mode, false);
                const statement = request.statement;
                if (statement !== undefined && statement.shape === undefined) statement.shape = shape;
                break;
            }
            case 116: {
                // t, parameter description
                const statement = this.current!.statement;
                if (statement !== undefined && statement.parameterTypes === undefined) {
                    const count = (data[start + 5] << 8) | data[start + 6];
                    const types: number[] = new Array(count);
                    for (let i = 0; i < count; i++) types[i] = int32(data, start + 7 + i * 4) >>> 0;
                    statement.parameterTypes = types;
                }
                break;
            }
            case 115: // s, portal suspended, not used
            case 51: // 3, close complete
                break;
            case 69: // E
                this.onErrorMessage(data, start, end);
                break;
            case 78: // N
                this.onNoticeMessage(data, start, end);
                break;
            case 83: // S, a setting changed
                this.onParameterStatus(data, start, end);
                break;
            case 65: {
                // A, notification
                if (this.onNotification) {
                    let stop = start + 9;
                    while (data[stop] !== 0) stop++;
                    this.onNotification(
                        decodeText(data, start + 9, stop),
                        decodeText(data, stop + 1, end - 1),
                        int32(data, start + 5),
                    );
                }
                break;
            }
            case 71: // G, copy in
                this.onCopyIn(this.current!);
                break;
            case 72: // H, copy out
            case 87: // W, copy both
            case 100: // d, copy data
            case 99: // c, copy done
                break;
            default:
                this.fail(new PostgresConnectionError(`Unknown message type ${data[start]}`));
        }
    }

    onDataRow(data: Uint8Array, start: number): void {
        const request = this.current!;
        try {
            const row = request.decode!(data, start + 7);
            if (request.rows === undefined) request.rows = [row];
            else request.rows.push(row);
        } catch (error) {
            // the stream is fine, only this value could not be read
            this.inFlight.at(0)!.error ||= error;
        }
    }

    onCommandComplete(data: Uint8Array, start: number, end: number): void {
        const request = this.current!;
        request.rowCount = parseRowCount(data, start + 5, end - 1);
        request.commands++;
        this.advanceBatch(request);
    }

    onReadyForQuery(data: Uint8Array, start: number): void {
        if (this.phase !== Phase.ready) {
            this.onStartupMessage(data, start, start + 6);
            return;
        }
        const status = (this.transactionStatus = data[start + 5]);
        const request = this.inFlight.shift();
        if (!request) {
            this.fail(new PostgresConnectionError('Got a server response without active query'));
            return;
        }
        this.current = this.headTarget();
        this.finish(request, status);
    }

    /** A command of a batch is complete, what follows belongs to the next. */
    protected advanceBatch(request: QueryRequest): void {
        const head = this.inFlight.at(0);
        if (head === undefined || head.items === undefined) return;
        head.index++;
        this.current = head.items[head.index] ?? head;
    }

    protected onErrorMessage(data: Uint8Array, start: number, end: number): void {
        const error = parseErrorResponse(data, start + 5, end);
        const head = this.inFlight.at(0);
        if (head === undefined) {
            // reported by the server on its own, the connection is about to close, for example on shutdown
            this.fatalError = this.connectionError(error);
            return;
        }
        if (head.items !== undefined) error.batchIndex = head.index;
        if (head.error === undefined) head.error = error;
        if (head.statement !== undefined && head.parsed && !head.parseConfirmed)
            this.forgetStatement(head.statement, false);
    }

    /** A request's reply is complete, ReadyForQuery was received. */
    protected finish(request: QueryRequest, status: number): void {
        const error = request.error;
        if (error !== undefined) {
            if (request.statement !== undefined && isStaleStatementError(error)) {
                this.forgetStatement(request.statement, true);
                // in a transaction it already aborted it, so this is reported
                if (status === idleStatus && !request.retried && !request.abandoned) {
                    this.resend(request);
                    return;
                }
            }
            request.reject(error);
            this.recycle(request);
            return;
        }

        if (request.items !== undefined) {
            const results: QueryResult[] = new Array(request.items.length);
            for (let i = 0; i < request.items.length; i++) {
                const item = request.items[i];
                results[i] = {
                    rows: item.rows ?? [],
                    rowCount: item.rowCount,
                    fields: item.shape ? item.shape.columns : emptyColumns,
                };
            }
            request.resolve(results);
        } else if (request.commands > 1) {
            if (request.resolution === Resolution.rows || request.resolution === Resolution.row) {
                request.resolve(undefined);
            } else {
                request.resolve({ rows: undefined as any, rowCount: undefined as any, fields: emptyColumns });
            }
        } else if (request.resolution === Resolution.rows) {
            request.resolve(request.rows ?? []);
        } else if (request.resolution === Resolution.row) {
            request.resolve(request.rows === undefined ? undefined : request.rows[0]);
        } else if (request.resolution === Resolution.rowCount) {
            request.resolve(request.rowCount);
        } else {
            request.resolve({
                rows: request.rows ?? [],
                rowCount: request.rowCount,
                fields: request.shape ? request.shape.columns : emptyColumns,
            });
        }
        this.recycle(request);
    }

    protected recycle(request: QueryRequest): void {
        if (request.items !== undefined) {
            for (const item of request.items) {
                item.reset();
                if (this.free.length < maxFreeRequests) this.free.push(item);
            }
        }
        request.reset();
        if (this.free.length < maxFreeRequests) this.free.push(request);
    }

    protected forgetStatement(statement: PreparedStatement, close: boolean): void {
        if (statement.forgotten) return;
        statement.forgotten = true;
        this.statements?.delete(statement.sql);
        if (close) this.pendingCloses.push(statement.nameBytes);
    }

    protected take(sql: string, params: any[] | undefined, mode: RowMode, resolution: Resolution): QueryRequest {
        const request = this.free.pop() ?? new QueryRequest();
        request.sql = sql;
        request.params = params;
        request.mode = mode;
        request.resolution = resolution;
        if (this.options.queryTimeout > 0) request.deadline = Date.now() + this.options.queryTimeout;
        return request;
    }

    protected enqueue(request: QueryRequest): void {
        this.inFlight.push(request);
        if (this.current === undefined) this.current = this.headTarget();
    }

    protected getStatement(sql: string): PreparedStatement | undefined {
        if (this.statements === undefined || sql.length > maxPreparedStatementLength) return undefined;
        let statement = this.statements.get(sql);
        if (statement === undefined) {
            statement = new PreparedStatement(sql, 'deepkit_' + ++this.statementId);
            // can evict the oldest and schedule its Close
            this.statements.set(sql, statement);
        }
        return statement;
    }

    /**
     * Sends a query in the extended protocol with its own Sync, so that a failure doesn't affect any other.
     * Sends messages right away for the socket writer to batch them across callers of this tick.
     */
    protected sendExtended(request: QueryRequest): void {
        const encoder = this.encoder;
        const params = request.params;
        encoder.reset();
        this.writePendingCloses();
        const statement = request.statement;
        if (statement !== undefined) {
            const bind = statement.bind ?? this.compileBindOf(statement);
            if (bind !== undefined && params !== undefined && params.length === bind.count) {
                const shape = statement.shape;
                if (shape !== undefined) {
                    request.shape = shape;
                    request.decode = shape.decoder(request.mode, true);
                }
                bind.encode(encoder, params);
                this.flush();
                return;
            }

            if (!statement.parsed) {
                statement.parsed = true;
                request.parsed = true;
                encoder.writeParse(statement.nameBytes, request.sql);
                // gets the types of the parameters, for the next run
                encoder.writeDescribeStatement(statement.nameBytes);
                encoder.writeBind(statement.nameBytes, params, textResultFormats);
            } else if (statement.shape !== undefined) {
                // runs with the wrong number of parameters, which the server reports
                request.shape = statement.shape;
                request.decode = statement.shape.decoder(request.mode, true);
                encoder.writeBind(statement.nameBytes, params, statement.shape.binaryResultFormats());
            } else {
                // the first run of it is still on its way
                encoder.writeBind(statement.nameBytes, params, textResultFormats);
                if (!statement.noData) encoder.writeDescribePortal();
            }
        } else {
            encoder.writeParse(emptyName, request.sql);
            encoder.writeBind(emptyName, params, textResultFormats);
            encoder.writeDescribePortal();
        }
        encoder.writeExecute();
        encoder.writeSync();
        this.flush();
    }

    /** Once the server described a statement, its Bind doesn't change anymore. */
    protected compileBindOf(statement: PreparedStatement): CompiledBind | undefined {
        if (statement.parameterTypes === undefined || (statement.shape === undefined && !statement.noData))
            return undefined;
        return (statement.bind = compileBind(
            statement.nameBytes,
            statement.parameterTypes,
            statement.shape ? statement.shape.binaryResultFormats() : textResultFormats,
            this.encoder.parseInputDatesAsUTC,
        ));
    }

    protected writePendingCloses(): void {
        if (this.pendingCloses.length === 0) return;
        for (const name of this.pendingCloses) this.encoder.writeCloseStatement(name);
        this.pendingCloses.length = 0;
    }

    protected sendSimple(request: QueryRequest): void {
        const encoder = this.encoder;
        encoder.reset();
        this.writePendingCloses();
        encoder.writeQuery(request.sql);
        this.flush();
    }

    /** A statement was stale: the query runs again unnamed, the one that is reported is the second error. */
    protected resend(request: QueryRequest): void {
        request.retried = true;
        request.statement = undefined;
        request.error = undefined;
        request.rows = undefined;
        request.rowCount = null;
        request.commands = 0;
        request.shape = undefined;
        request.decode = undefined;
        request.parsed = false;
        request.parseConfirmed = false;
        this.enqueue(request);
        this.sendExtended(request);
    }

    protected unavailable(): Promise<any> {
        return Promise.reject(
            this.fatalError ||
                new PostgresConnectionError(
                    this.phase === Phase.closed ? 'Connection closed' : 'Connection is not ready',
                ),
        );
    }

    protected execute(
        sql: string,
        params: any[] | undefined,
        mode: RowMode,
        reusable: boolean,
        resolution: Resolution,
    ): Promise<any> {
        if (this.phase !== Phase.ready) return this.unavailable();
        if (params !== undefined && params.length > 65535) {
            return Promise.reject(
                new PostgresError(`Too many query parameters: ${params.length}, the maximum is 65535`),
            );
        }
        const request = this.take(sql, params, mode, resolution);
        const promise = new Promise<any>(request.executor);
        try {
            this.enqueue(request);
            if (params !== undefined && params.length > 0) {
                if (reusable) request.statement = this.getStatement(sql);
                this.sendExtended(request);
            } else {
                this.sendSimple(request);
            }
        } catch (error) {
            // a parameter could not be written, so nothing was sent
            if (request.parsed && request.statement !== undefined) request.statement.parsed = false;
            this.inFlight.removeAt(this.inFlight.size - 1);
            if (this.current === request) this.current = this.headTarget();
            this.encoder.reset();
            request.reject(error);
            this.recycle(request);
        }
        return promise;
    }

    /**
     * Runs a query. Without parameters the simple protocol is used, which allows several statements at once.
     *
     * @param reusable Keeps the statement on the server and uses binary results for it from the second run on.
     */
    query(
        sql: string,
        params?: any[],
        mode: RowMode = RowMode.object,
        reusable: boolean = false,
    ): Promise<QueryResult> {
        return this.execute(sql, params, mode, reusable, Resolution.result);
    }

    /** Like query, but resolves with only the rows. */
    queryRows(sql: string, params?: any[], mode: RowMode = RowMode.object, reusable: boolean = false): Promise<any[]> {
        return this.execute(sql, params, mode, reusable, Resolution.rows);
    }

    /** Like query, but resolves with only the first row, undefined if there is none. */
    queryRow(sql: string, params?: any[], mode: RowMode = RowMode.object, reusable: boolean = false): Promise<any> {
        return this.execute(sql, params, mode, reusable, Resolution.row);
    }

    /**
     * Runs the queries of one caller with a single Sync. Each one runs after the other in the same implicit
     * transaction: when one fails none of them are committed and the promise is rejected, with a batchIndex.
     */
    batch(queries: { sql: string; params?: any[] }[]): Promise<QueryResult[]> {
        if (this.phase !== Phase.ready) return this.unavailable();
        if (queries.length === 0) return Promise.resolve([]);
        const root = this.take('', undefined, RowMode.object, Resolution.result);
        root.items = queries.map(query => {
            const item = this.take(query.sql, query.params, RowMode.object, Resolution.result);
            return item;
        });
        const promise = new Promise<QueryResult[]>(root.executor);
        try {
            const encoder = this.encoder;
            encoder.reset();
            this.writePendingCloses();
            for (const query of queries) {
                encoder.writeParse(emptyName, query.sql);
                encoder.writeBind(emptyName, query.params, textResultFormats);
                encoder.writeDescribePortal();
                encoder.writeExecute();
            }
            encoder.writeSync();
            this.enqueue(root);
            this.flush();
        } catch (error) {
            root.reject(error);
            this.recycle(root);
        }
        return promise;
    }

    /**
     * Runs COPY ... FROM STDIN and sends the chunks. Needs a connection of its own, as nothing else
     * can run while it is in progress. Resolves with the number of rows.
     */
    copyFrom(sql: string, source: Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>): Promise<number> {
        if (this.phase !== Phase.ready) return this.unavailable();
        const request = this.take(sql, undefined, RowMode.object, Resolution.rowCount);
        request.copy = source;
        const promise = new Promise<number>(request.executor);
        this.enqueue(request);
        this.sendSimple(request);
        return promise;
    }

    protected onCopyIn(request: QueryRequest): void {
        const source = request.copy;
        request.copy = undefined;
        if (source === undefined) {
            const encoder = this.encoder;
            encoder.reset();
            encoder.writeCopyFail('COPY FROM STDIN is only supported via copyFrom');
            this.flush();
            return;
        }
        this.sendCopyData(source).catch(error => {
            const encoder = this.encoder;
            encoder.reset();
            encoder.writeCopyFail(String(error?.message ?? error));
            this.flush();
        });
    }

    protected async sendCopyData(
        source: Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>,
    ): Promise<void> {
        const encoder = this.encoder;
        for await (const chunk of source) {
            if (this.phase !== Phase.ready) return;
            encoder.reset();
            encoder.writeCopyData(chunk);
            this.flush();
            if (this.socket.writableNeedDrain) await new Promise<void>(resolve => this.socket.once('drain', resolve));
        }
        encoder.reset();
        encoder.writeCopyDone();
        this.flush();
    }

    /**
     * Rejects the running query at the head when it is past its deadline, and asks the server to stop it.
     * Its replies are still read and ignored, as they would otherwise be attributed to the next query.
     */
    checkTimeout(now: number): void {
        const head = this.inFlight.at(0);
        if (head === undefined || head.deadline === 0 || head.abandoned || now < head.deadline) return;
        head.abandoned = true;
        const reject = head.reject;
        head.resolve = noop;
        head.reject = noop;
        reject(new PostgresConnectionError('Query read timeout'));
        this.cancel().catch(noop);
    }

    /**
     * Asks the server to stop whatever this connection is currently executing, via a separate connection.
     * Everything queued behind it on this connection keeps running.
     */
    cancel(): Promise<void> {
        if (this.backendPid === 0) return Promise.resolve();
        const options = this.options;
        return openTransport(options).then(
            socket =>
                new Promise<void>(resolve => {
                    const request = Buffer.alloc(16);
                    request.writeInt32BE(16, 0);
                    request.writeInt32BE(80877102, 4);
                    request.writeInt32BE(this.backendPid, 8);
                    request.writeInt32BE(this.backendSecret, 12);
                    socket.once('close', () => resolve());
                    socket.once('error', () => resolve());
                    socket.end(request);
                }),
        );
    }
}
