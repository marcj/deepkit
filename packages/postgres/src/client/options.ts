import { readFileSync } from 'fs';
import { isIP } from 'net';
import type { ConnectionOptions as TlsConnectionOptions } from 'tls';

export type PostgresPassword = string | (() => string | Promise<string>);

/** Options of the former driver are accepted under the same names. */
export interface PostgresClientOptions {
    user?: string;
    database?: string;
    password?: PostgresPassword;
    port?: number;
    /** A directory starting with / connects via unix socket. */
    host?: string;
    /** A postgres:// URL, its values take precedence over the other options. */
    connectionString?: string;
    keepAlive?: boolean;
    keepAliveInitialDelayMillis?: number;
    statement_timeout?: false | number;
    lock_timeout?: false | number;
    idle_in_transaction_session_timeout?: false | number;
    /** Client side timeout. On expiry the query is rejected and cancelled on the server. */
    query_timeout?: number;
    parseInputDatesAsUTC?: boolean;
    ssl?: boolean | TlsConnectionOptions;
    application_name?: string;
    fallback_application_name?: string;
    options?: string;
    /** Also limits the wait for a free connection of the pool. */
    connectionTimeoutMillis?: number;
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    /**
     * When all connections are busy, how many users may share one by pipelining.
     * 1 or less turns pipelining off, then callers wait for a free connection.
     */
    maxPipelineDepth?: number;
    /**
     * Queries that can be shared go on a connection busy with fewer than this many before an idle one is used.
     * Fewer backends do more per round trip. 1 prefers idle connections.
     */
    preferPipelineDepth?: number;
    /** Not used. Accepted for compatibility. */
    client_encoding?: string;
    allowExitOnIdle?: boolean;
    maxUses?: number;
}

export interface ResolvedPostgresOptions {
    user: string;
    database: string;
    password?: PostgresPassword;
    port: number;
    host: string;
    /** Path of the unix socket, when host is a directory. */
    socketPath?: string;
    keepAlive: boolean;
    keepAliveInitialDelayMillis: number;
    queryTimeout: number;
    parseInputDatesAsUTC: boolean;
    ssl?: TlsConnectionOptions;
    startupParameters: { [name: string]: string };
    connectionTimeoutMillis: number;
    max: number;
    min: number;
    idleTimeoutMillis: number;
    maxPipelineDepth: number;
    preferPipelineDepth: number;
}

function sslFromMode(mode: string | undefined): TlsConnectionOptions | undefined {
    if (mode === undefined || mode === 'disable') return undefined;
    if (mode === 'no-verify') return { rejectUnauthorized: false };
    return {};
}

/** Parses a URL into options. Query parameters that are not known are ignored. */
export function parsePostgresConnectionString(connectionString: string): PostgresClientOptions {
    const url = new URL(connectionString);
    const result: PostgresClientOptions = {};
    if (url.hostname) result.host = decodeURIComponent(url.hostname);
    if (url.port) result.port = Number(url.port);
    if (url.username) result.user = decodeURIComponent(url.username);
    if (url.password) result.password = decodeURIComponent(url.password);
    const database = url.pathname.replace(/^\//, '');
    if (database) result.database = decodeURIComponent(database);

    const query = url.searchParams;
    const host = query.get('host');
    if (host) result.host = host;
    const port = query.get('port');
    if (port) result.port = Number(port);
    for (const name of ['application_name', 'fallback_application_name', 'options'] as const) {
        const value = query.get(name);
        if (value !== null) result[name] = value;
    }

    let ssl: TlsConnectionOptions | undefined = sslFromMode(query.get('sslmode') ?? undefined);
    const sslParam = query.get('ssl');
    if (sslParam === '1' || sslParam === 'true') ssl ||= {};
    if (sslParam === '0' || sslParam === 'false') ssl = undefined;
    for (const [param, option] of [
        ['sslrootcert', 'ca'],
        ['sslcert', 'cert'],
        ['sslkey', 'key'],
    ] as const) {
        const path = query.get(param);
        if (path) {
            ssl ||= {};
            ssl[option] = readFileSync(path).toString();
        }
    }
    if (ssl) result.ssl = ssl;
    return result;
}

function timeoutParameter(parameters: { [name: string]: string }, name: string, value?: false | number): void {
    if (value === undefined || value === false) return;
    parameters[name] = String(Math.trunc(value));
}

/** Applies connection string, environment variables and defaults, in that order of precedence. */
export function resolvePostgresOptions(input: PostgresClientOptions = {}): ResolvedPostgresOptions {
    const options: PostgresClientOptions = input.connectionString
        ? { ...input, ...parsePostgresConnectionString(input.connectionString) }
        : input;
    const env = process.env;

    const user = options.user ?? env.PGUSER ?? env.USER ?? env.USERNAME ?? 'postgres';
    const host = options.host ?? env.PGHOST ?? 'localhost';
    const port = options.port ?? (env.PGPORT ? Number(env.PGPORT) : 5432);
    let ssl: TlsConnectionOptions | undefined;
    if (options.ssl === true) ssl = {};
    else if (options.ssl) ssl = options.ssl;
    else if (options.ssl === undefined) ssl = sslFromMode(env.PGSSLMODE);
    if (ssl && ssl.servername === undefined && !isIP(host) && !host.startsWith('/')) ssl = { ...ssl, servername: host };

    // Timestamps in text format, as used by the first run of a statement, have to have a fixed layout.
    const startupParameters: { [name: string]: string } = {
        user,
        database: options.database ?? env.PGDATABASE ?? user,
        client_encoding: 'UTF8',
        DateStyle: 'ISO, MDY',
    };
    const applicationName = options.application_name ?? env.PGAPPNAME;
    if (applicationName) startupParameters.application_name = applicationName;
    if (options.fallback_application_name)
        startupParameters.fallback_application_name = options.fallback_application_name;
    if (options.options) startupParameters.options = options.options;
    timeoutParameter(startupParameters, 'statement_timeout', options.statement_timeout);
    timeoutParameter(startupParameters, 'lock_timeout', options.lock_timeout);
    timeoutParameter(
        startupParameters,
        'idle_in_transaction_session_timeout',
        options.idle_in_transaction_session_timeout,
    );

    return {
        user,
        database: startupParameters.database,
        password: options.password ?? env.PGPASSWORD,
        port,
        host,
        socketPath: host.startsWith('/') ? host.replace(/\/$/, '') + '/.s.PGSQL.' + port : undefined,
        keepAlive: options.keepAlive === true,
        keepAliveInitialDelayMillis: options.keepAliveInitialDelayMillis ?? 0,
        queryTimeout: options.query_timeout ?? 0,
        parseInputDatesAsUTC: options.parseInputDatesAsUTC === true,
        ssl,
        startupParameters,
        connectionTimeoutMillis: options.connectionTimeoutMillis ?? 0,
        max: options.max ?? 10,
        min: options.min ?? 0,
        idleTimeoutMillis: options.idleTimeoutMillis ?? 10000,
        maxPipelineDepth: options.maxPipelineDepth ?? 16,
        preferPipelineDepth: options.preferPipelineDepth ?? 1,
    };
}
