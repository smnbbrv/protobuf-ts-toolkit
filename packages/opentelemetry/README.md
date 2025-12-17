# @protobuf-ts-toolkit/opentelemetry

OpenTelemetry tracing interceptor for protobuf-ts gRPC clients.

## Installation

```bash
npm install @protobuf-ts-toolkit/opentelemetry @opentelemetry/api
```

## Usage

```typescript
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { createOtelInterceptor } from '@protobuf-ts-toolkit/opentelemetry';

const transport = new GrpcWebFetchTransport({
  baseUrl: 'https://api.example.com',
  interceptors: [createOtelInterceptor()],
});
```

### Custom Tracer Name

```typescript
const otelInterceptor = createOtelInterceptor({
  tracerName: 'my-service-client',
});
```

### Custom Span Names

```typescript
const otelInterceptor = createOtelInterceptor({
  spanNameFormatter: (method, callType) =>
    `${callType}:${method.service.typeName}/${method.name}`,
});
```

## Features

- Creates spans for all gRPC call types (unary, server streaming, client streaming, duplex)
- Sets semantic convention attributes:
  - `rpc.system`: "grpc"
  - `rpc.service`: Service type name
  - `rpc.method`: Full method path
  - `rpc.grpc.status_code`: Response status code
- Automatically propagates trace context via W3C Trace Context headers
- Sets span status based on call success/failure

## Configuration

```typescript
interface OtelConfig {
  // Tracer name (default: '@protobuf-ts-toolkit/opentelemetry')
  tracerName?: string;

  // Custom span name formatter (default: 'grpc.{service}/{method}')
  spanNameFormatter?: (method: MethodInfo, callType: string) => string;
}
```
