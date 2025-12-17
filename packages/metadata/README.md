# @protobuf-ts-toolkit/metadata

Interceptor for adding metadata to gRPC calls. Supports static values, sync functions, and async functions with proper streaming support.

## Installation

```bash
npm install @protobuf-ts-toolkit/metadata
```

## Usage

### Static Metadata

```typescript
import { createMetadataInterceptor } from '@protobuf-ts-toolkit/metadata';

const interceptor = createMetadataInterceptor({
  metadata: { 'x-api-key': 'key123' }
});
```

### Dynamic Metadata (Sync)

```typescript
const interceptor = createMetadataInterceptor({
  metadata: () => ({
    'x-request-id': crypto.randomUUID()
  })
});
```

### Async Metadata

```typescript
const interceptor = createMetadataInterceptor({
  metadata: async () => ({
    'authorization': `Bearer ${await getAccessToken()}`
  })
});
```

### Multiple Headers

```typescript
const interceptor = createMetadataInterceptor({
  metadata: async ({ method }) => ({
    'authorization': `Bearer ${await getAccessToken()}`,
    'x-csrf-token': await getCsrfToken(),
    'x-method': method.name
  })
});
```

### Filter by Call Type

```typescript
const interceptor = createMetadataInterceptor({
  metadata: async () => ({
    'authorization': `Bearer ${await generateOneTimeToken()}`
  }),
  callTypes: ['clientStreaming', 'duplex']
});
```

## Configuration

```typescript
interface MetadataInterceptorConfig {
  // Metadata to add - static object, sync function, or async function
  metadata: MetadataProvider;

  // Optional: filter which call types to intercept
  // Default: all call types
  callTypes?: ('unary' | 'serverStreaming' | 'clientStreaming' | 'duplex')[];
}

type MetadataProvider =
  | RpcMetadata
  | ((context: MetadataContext) => RpcMetadata)
  | ((context: MetadataContext) => Promise<RpcMetadata>);

interface MetadataContext {
  callType: 'unary' | 'serverStreaming' | 'clientStreaming' | 'duplex';
  method: MethodInfo;
}
```

## How It Works

For streaming calls, the interceptor buffers outgoing messages while waiting for async metadata to resolve. Once resolved, buffered messages are flushed to the actual stream.
