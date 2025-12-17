# @protobuf-ts-toolkit/grpc-error

Error classes and interceptor for gRPC applications, with support for [Google RPC error details](https://cloud.google.com/apis/design/errors#error_details).

## Installation

```bash
npm install @protobuf-ts-toolkit/grpc-error
```

## Client Usage (Interceptor)

```typescript
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { createErrorInterceptor, ValidationError, NotFoundError } from '@protobuf-ts-toolkit/grpc-error';

const transport = new GrpcWebFetchTransport({
  baseUrl: 'https://api.example.com',
  interceptors: [createErrorInterceptor()],
});

const client = new MyServiceClient(transport);

try {
  await client.createUser({ name: '' });
} catch (e) {
  if (e instanceof ValidationError) {
    // Access parsed field violations from error details
    for (const detail of e.details) {
      if (detail.type === 'badRequest') {
        for (const v of detail.fieldViolations) {
          console.log(`${v.field}: ${v.description}`);
        }
      }
    }
  }

  if (e instanceof NotFoundError) {
    console.log(`Resource not found: ${e.localizedMessage}`);
  }
}
```

### Interceptor Features

- Captures call-site stack traces for better debugging (gRPC connection pooling normally obscures this)
- Parses rich error details from `grpc-status-details-bin` trailer
- Maps gRPC status codes to typed error classes
- Optional `onError` callback for global error handling

```typescript
createErrorInterceptor({
  onError: (error) => {
    if (error instanceof UnauthenticatedError) {
      router.push('/login');
    }
  },
});
```

## Server Usage (Encoding)

```typescript
import { ValidationError, encodeGrpcStatus } from '@protobuf-ts-toolkit/grpc-error';

// Throw typed errors on server
const error = new ValidationError({
  localizedMessage: 'Invalid email format',
  details: [{
    type: 'badRequest',
    fieldViolations: [{ field: 'email', description: 'Must be a valid email' }]
  }]
});

// Encode to binary for grpc-status-details-bin trailer
const binary = encodeGrpcStatus(error);
```

## Error Classes

- `GrpcError` - Base class for all gRPC errors
- `ValidationError` - Invalid input (INVALID_ARGUMENT)
- `NotFoundError` - Resource not found (NOT_FOUND)
- `AlreadyExistsError` - Resource already exists (ALREADY_EXISTS)
- `PermissionDeniedError` - Permission denied (PERMISSION_DENIED)
- `UnauthenticatedError` - Not authenticated (UNAUTHENTICATED)
- `UnavailableError` - Service unavailable (UNAVAILABLE)
- `DeadlineExceededError` - Request timeout (DEADLINE_EXCEEDED)
- `AbortedError` - Operation aborted (ABORTED)
- `RaceUpdateError` - Concurrent modification conflict (ABORTED)
- `UnknownError` - Unknown error (UNKNOWN)

## Error Details

Supports all standard Google RPC error detail types:

- `BadRequestDetail` - Field violations
- `ErrorInfoDetail` - Structured error info with reason and metadata
- `RetryInfoDetail` - Retry delay information
- `DebugInfoDetail` - Debug information (stack traces, detail)
- `QuotaFailureDetail` - Quota violation details
- `PreconditionFailureDetail` - Precondition failures
- `ResourceInfoDetail` - Resource information
- `RequestInfoDetail` - Request identification
- `HelpDetail` - Help links
- `LocalizedMessageDetail` - Localized error messages
