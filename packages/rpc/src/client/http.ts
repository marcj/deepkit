import { RpcError } from '../model.js';
import { rpcDecodeError } from '../protocol.js';
import { TransportClientConnection } from '../transport.js';
import { RpcHttpActionTypes, RpcHttpTransport } from './action.js';
import { ClientTransportAdapter, RpcClient } from './client.js';

declare const location: { protocol: string; host: string; origin: string };

export interface RpcHttpResponseInterface {
    status: number;
    headers: { [name: string]: string };
    body?: any;
}

export interface RpcHttpInterface {
    fetch(
        url: string,
        options: {
            headers: { [name: string]: string };
            method: string;
            body?: string;
        },
    ): Promise<RpcHttpResponseInterface>;
}

export class RpcHttpFetch implements RpcHttpInterface {
    constructor(private baseUrl: string | ((url: string) => string) = '') {}

    async fetch(
        url: string,
        options: {
            headers: { [name: string]: string };
            method: string;
            body: any;
        },
    ): Promise<RpcHttpResponseInterface> {
        if ('function' === typeof this.baseUrl) {
            url = this.baseUrl(url);
        } else if (this.baseUrl) {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                // already absolute URL
            } else {
                url = this.baseUrl + (url.startsWith('/') ? url : '/' + url);
            }
        }

        const res = await fetch(url, options);
        const body = await res.json();

        return {
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body,
        };
    }
}

export function createRpcHttpClientProvider(
    baseUrl: string = typeof location !== 'undefined' ? location.origin : 'http://localhost',
    headers: { [name: string]: string } = {},
    http?: RpcHttpInterface,
) {
    return {
        provide: RpcClient,
        useFactory: () => new RpcClient(new RpcHttpClientAdapter(baseUrl, headers, http)),
    };
}

export class RpcHttpClientAdapter implements ClientTransportAdapter, RpcHttpTransport {
    constructor(
        public url: string,
        public headers: { [name: string]: string } = {},
        public http: RpcHttpInterface = new RpcHttpFetch(),
    ) {
        this.url = url.endsWith('/') ? url.slice(0, -1) : url;
    }

    supportsPeers() {
        //no ClientId call
        return false;
    }

    supportsAuthentication() {
        return false;
    }

    httpTransport(): RpcHttpTransport {
        return this;
    }

    async connect(connection: TransportClientConnection): Promise<void> {
        // http transporter does not connect, every call is a request of its own
        connection.onConnected({
            bufferedAmount(): number {
                return 0;
            },
            close(): void {},
            clientAddress(): string {
                return '';
            },
        });
    }

    protected async request(path: string, method: string, token: any, body?: string): Promise<any> {
        const res = await this.http.fetch(this.url + '/' + path, {
            headers: Object.assign(
                {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...(token != undefined
                        ? {
                              Authorization: String(token),
                          }
                        : {}),
                },
                this.headers,
            ),
            method,
            body,
        });
        if (res.headers['x-rpc-error'] || res.headers['X-Rpc-Error']) throw rpcDecodeError(res.body);
        if (res.status >= 400) throw new RpcError(res.body?.error ?? `HTTP status ${res.status}`);
        return res.body;
    }

    requestTypes(controller: string, method: string, token: any): Promise<RpcHttpActionTypes> {
        return this.request(controller + '/' + encodeURIComponent(method) + '.type?', 'GET', token);
    }

    requestCall(controller: string, method: string, args: any[], token: any): Promise<any> {
        const path = controller + '/' + encodeURIComponent(method);
        const allPrimitive = args.every(v => ['string', 'number', 'boolean', 'bigint'].includes(typeof v));
        if (allPrimitive) {
            return this.request(
                path + '?' + args.map(v => 'arg=' + encodeURIComponent(String(v))).join('&'),
                'GET',
                token,
            );
        }
        return this.request(path + '?', 'POST', token, JSON.stringify(args));
    }
}

export const RpcHttpHeaderNames = ['x-rpc-error'];
