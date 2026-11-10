# @deepkit/net

Building blocks for binary network clients. The main entry works in browsers, `@deepkit/net/node` needs Node's `net`.

- `ContextDispatcher`: replies matched by an id on the wire.
- `RequestQueue`: replies that arrive in the order of the requests.
- `FrameReader`: length-prefixed messages from a stream, without allocating for each message.
- `HostConnections`: the connections of one host, including pipelining on busy connections.
- `connectSocket`, `SocketWriter` (from `@deepkit/net/node`): a reused read buffer and batched writes.
