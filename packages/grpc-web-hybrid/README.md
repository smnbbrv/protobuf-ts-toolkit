# @protobuf-ts-toolkit/grpc-web-hybrid

Hybrid gRPC-web transport that automatically routes calls to the appropriate transport:

- **Unary & Server Streaming**: HTTP/fetch via `GrpcWebFetchTransport`
- **Client Streaming & Duplex**: WebSocket via `@improbable-eng/grpc-web`

## Why?

Standard gRPC-web over HTTP only supports unary and server streaming. Client streaming and bidirectional streaming require WebSocket support. This transport handles routing automatically.

## Installation

```bash
npm install @protobuf-ts-toolkit/grpc-web-hybrid @protobuf-ts/grpcweb-transport @improbable-eng/grpc-web
```

## Usage

```typescript
import { GrpcWebHybridTransport } from '@protobuf-ts-toolkit/grpc-web-hybrid';

const transport = new GrpcWebHybridTransport({
  baseUrl: 'https://api.example.com',
  interceptors: [
    createErrorInterceptor(),
    createOtelInterceptor(),
  ],
});

const client = new MyServiceClient(transport);

// Unary call - uses HTTP
await client.getUser({ id: '123' });

// Server streaming - uses HTTP
for await (const event of client.streamEvents({}).responses) {
  console.log(event);
}

// Client streaming - uses WebSocket
const upload = client.uploadChunks({});
await upload.requests.send({ data: chunk1 });
await upload.requests.send({ data: chunk2 });
await upload.requests.complete();
const result = await upload.response;

// Bidirectional streaming - uses WebSocket
const chat = client.chat({});
chat.responses.onNext((msg) => console.log('Received:', msg));
await chat.requests.send({ text: 'Hello' });
```

## Configuration

```typescript
interface GrpcWebHybridTransportOptions {
  // Base URL for the gRPC server
  // Use empty string '' to use current origin (browser only)
  baseUrl: string;

  // Interceptors applied to all calls
  interceptors?: RpcInterceptor[];
}
```

## Browser Usage

Use empty string for `baseUrl` to automatically use the current origin:

```typescript
const transport = new GrpcWebHybridTransport({
  baseUrl: '', // Uses window.location.origin
});
```
