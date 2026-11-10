export interface RpcHttpRequest {
    headers: { [name: string]: undefined | string | string[] };
    method?: string;
    url?: string;
    body?: Uint8Array;
}

export interface RpcHttpResponse {
    setHeader(name: string, value: number | string): this;

    writeHead(statusCode: number): this;

    end(data?: Uint8Array | string): void;
}
