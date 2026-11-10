# Transport Protocol

Deepkit RPC supports several transport protocols. WebSockets is the protocol that has the best compatibility (since browsers support it) while supporting all features like streaming. TCP is usually faster and is great for communication between servers (microservices) or non-browser clients. But WebSockets work well for server to server communication as well.

## HTTP

Every action call is an HTTP request with a JSON response. It works without a persistent connection, for example with server-side rendering, serverless platforms or proxies that don't pass WebSockets, and each call is easy to debug in the browser. Streaming results like RxJS Observables and Collections need a connection, so they are not available over HTTP.

Enable it with `httpRpcBasePath` of the `FrameworkModule` and use `RpcHttpClientAdapter` on the client. See [RPC over HTTP](./http).

## WebSockets

@deepkit/rpc-tcp `RpcWebSocketServer` and Browser WebSocket or Node `ws` package.

## TCP

@deepkit/rpc-tcp `RpcNetTcpServer` and `RpcNetTcpClientAdapter`
