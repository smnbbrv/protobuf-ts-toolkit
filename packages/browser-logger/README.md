# @protobuf-ts-toolkit/browser-logger

Browser console logging interceptor for gRPC calls.

## Installation

```bash
npm install @protobuf-ts-toolkit/browser-logger
```

## Usage

```typescript
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { createBrowserLogger } from '@protobuf-ts-toolkit/browser-logger';

const transport = new GrpcWebFetchTransport({
  baseUrl: 'https://api.example.com',
  interceptors: [createBrowserLogger()],
});
```

### Log Level

```typescript
// Use console.info instead of console.debug
createBrowserLogger({ level: 'info' });

// Use console.error (only logs errors by default anyway)
createBrowserLogger({ level: 'error' });
```

### Filtering

```typescript
// Only log unary calls
createBrowserLogger({
  shouldLog: ({ callType }) => callType === 'unary',
});

// Only log specific services
createBrowserLogger({
  shouldLog: ({ method }) => method.service.typeName.includes('UserService'),
});

// Disable in production
createBrowserLogger({
  shouldLog: () => process.env.NODE_ENV !== 'production',
});
```

## Configuration

```typescript
interface BrowserLoggerConfig {
  // Filter which calls to log (default: () => true)
  shouldLog?: (context: LogContext) => boolean;

  // Log level: 'debug' | 'info' | 'error' (default: 'debug')
  level?: LogLevel;
}

interface LogContext {
  method: MethodInfo;
  callType: 'unary' | 'serverStreaming' | 'clientStreaming' | 'duplex';
  level: LogLevel;
}
```

## Output

```
[gRPC] → UserService/GetUser { id: "123" }
[gRPC] ← UserService/GetUser (45.2ms) { name: "John", email: "john@example.com" }

[gRPC] → EventService/StreamEvents (stream) { filter: "all" }
[gRPC] ↓ EventService/StreamEvents (+120.5ms) { type: "created", ... }
[gRPC] ↓ EventService/StreamEvents (+250.3ms) { type: "updated", ... }
[gRPC] ← EventService/StreamEvents complete (1250.0ms)

[gRPC] ✗ UserService/GetUser (32.1ms) NotFoundError: User not found
```
