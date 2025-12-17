import type { MethodInfo, RpcInterceptor, RpcMetadata, RpcOptions, RpcStatus } from '@protobuf-ts/runtime-rpc';
import {
  ClientStreamingCall,
  Deferred,
  DuplexStreamingCall,
  RpcError,
  RpcOutputStreamController,
  ServerStreamingCall,
  UnaryCall,
} from '@protobuf-ts/runtime-rpc';
import { decodeGrpcStatus } from './codec/index.js';
import {
  AbortedError,
  AlreadyExistsError,
  DeadlineExceededError,
  GrpcError,
  NotFoundError,
  PermissionDeniedError,
  UnauthenticatedError,
  UnavailableError,
  UnknownError,
  ValidationError,
} from './errors.js';
import type { GrpcErrorOptions } from './types.js';

/**
 * gRPC status codes as strings (how they appear in RpcError.code).
 */
const GrpcStatusCode = {
  OK: 'OK',
  CANCELLED: 'CANCELLED',
  UNKNOWN: 'UNKNOWN',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  FAILED_PRECONDITION: 'FAILED_PRECONDITION',
  ABORTED: 'ABORTED',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  UNIMPLEMENTED: 'UNIMPLEMENTED',
  INTERNAL: 'INTERNAL',
  UNAVAILABLE: 'UNAVAILABLE',
  DATA_LOSS: 'DATA_LOSS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
} as const;

/**
 * Configuration options for the error interceptor.
 */
export interface ErrorInterceptorConfig {
  /**
   * Callback invoked when any error occurs.
   * Useful for logging, analytics, or triggering global actions (e.g., redirect on auth error).
   */
  onError?: (error: GrpcError) => void;
}

// Type for globalThis with optional atob/Buffer
const g = globalThis as {
  atob?: (data: string) => string;
  Buffer?: { from(s: string, e: string): Uint8Array };
};

/**
 * Decode base64 to binary. Works in all modern JS environments:
 * browsers (main thread + workers), Node.js 16+, Bun, Deno.
 */
function decodeBase64(base64: string): Uint8Array {
  if (typeof g.atob === 'function') {
    return Uint8Array.from(g.atob(base64), (c) => c.charCodeAt(0));
  }
  if (g.Buffer) {
    return new Uint8Array(g.Buffer.from(base64, 'base64'));
  }
  throw new Error('No base64 decoder available');
}

/**
 * Parse rich error details from the grpc-status-details-bin metadata header.
 */
function parseRichErrorDetails(meta: RpcMetadata): GrpcErrorOptions {
  const richError = meta['grpc-status-details-bin'];
  if (!richError) {
    return { details: [] };
  }

  try {
    const binary = decodeBase64(richError as string);
    const decoded = decodeGrpcStatus(binary);
    return { details: decoded.details };
  } catch {
    // If parsing fails, return empty details
    return { details: [] };
  }
}

/**
 * Capture the current stack trace for later use.
 * This is used to provide better stack traces that point to the call site
 * rather than deep inside gRPC connection pool internals.
 */
function captureCallSiteStack(): string | undefined {
  const captureTarget = { stack: '' };
  if (Error.captureStackTrace) {
    // V8 environments (Node.js, Chrome, Bun)
    Error.captureStackTrace(captureTarget, captureCallSiteStack);
    return captureTarget.stack;
  }
  // Fallback for non-V8 environments
  return new Error().stack;
}

/**
 * Apply a captured call-site stack trace to an error.
 * Preserves the error's name and message while using the call-site stack.
 */
function applyCallSiteStack(error: GrpcError, callSiteStack: string | undefined): void {
  if (!callSiteStack) return;

  // Replace stack but keep the error's own message line
  const errorHeader = `${error.name}: ${error.message}`;
  const stackLines = callSiteStack.split('\n').slice(1); // Remove the "Error" header line
  error.stack = `${errorHeader}\n${stackLines.join('\n')}`;
}

/**
 * Map an RpcError to the appropriate GrpcError subclass.
 */
function mapRpcError(
  e: unknown,
  abort: { aborted: boolean } | undefined,
  onError: ((error: GrpcError) => void) | undefined,
  callSiteStack: string | undefined,
): Error {
  if (!(e instanceof RpcError)) {
    return e instanceof Error ? e : new UnknownError();
  }

  // Check if the request was aborted by the client
  if (abort?.aborted) {
    const error = new AbortedError();
    applyCallSiteStack(error, callSiteStack);
    onError?.(error);
    return error;
  }

  const parsed = parseRichErrorDetails(e.meta);
  const options: GrpcErrorOptions = {
    ...parsed,
    cause: e,
  };

  let error: GrpcError;

  switch (e.code) {
    case GrpcStatusCode.CANCELLED:
    case GrpcStatusCode.ABORTED:
      error = new AbortedError(options);
      break;
    case GrpcStatusCode.UNAUTHENTICATED:
      error = new UnauthenticatedError(options);
      break;
    case GrpcStatusCode.UNAVAILABLE:
      error = new UnavailableError(options);
      break;
    case GrpcStatusCode.ALREADY_EXISTS:
      error = new AlreadyExistsError(options);
      break;
    case GrpcStatusCode.NOT_FOUND:
      error = new NotFoundError(options);
      break;
    case GrpcStatusCode.INVALID_ARGUMENT:
    case GrpcStatusCode.FAILED_PRECONDITION:
      error = new ValidationError(options);
      break;
    case GrpcStatusCode.DEADLINE_EXCEEDED:
      error = new DeadlineExceededError(options);
      break;
    case GrpcStatusCode.PERMISSION_DENIED:
      error = new PermissionDeniedError(options);
      break;
    default:
      error = new UnknownError(options);
  }

  applyCallSiteStack(error, callSiteStack);
  onError?.(error);
  return error;
}

/**
 * Creates a gRPC interceptor that maps RpcError to typed GrpcError subclasses.
 *
 * The interceptor:
 * - Captures the call-site stack trace before the gRPC call
 * - Catches RpcError from gRPC calls
 * - Parses rich error details from grpc-status-details-bin metadata
 * - Maps gRPC status codes to appropriate GrpcError subclasses
 * - Optionally invokes a callback on each error
 *
 * @example
 * ```typescript
 * const transport = new GrpcWebFetchTransport({
 *   baseUrl: '/api',
 *   interceptors: [
 *     createErrorInterceptor({
 *       onError: (error) => {
 *         if (error instanceof UnauthenticatedError) {
 *           router.push('/login');
 *         }
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function createErrorInterceptor(config?: ErrorInterceptorConfig): RpcInterceptor {
  const onError = config?.onError;

  return {
    interceptUnary(next, method, input, options) {
      // Capture stack trace at call site before any async operations
      const callSiteStack = captureCallSiteStack();

      const headers$ = new Deferred<RpcMetadata>();
      const response$ = new Deferred<object>();
      const status$ = new Deferred<RpcStatus>();
      const trailers$ = new Deferred<RpcMetadata>();

      (async () => {
        try {
          const res = await next(method, input, options);
          headers$.resolve(res.headers);
          response$.resolve(res.response);
          status$.resolve(res.status);
          trailers$.resolve(res.trailers);
        } catch (e) {
          const error = mapRpcError(e, options.abort, onError, callSiteStack);
          headers$.reject(error);
          response$.reject(error);
          status$.reject(error);
          trailers$.reject(error);
        }
      })();

      return new UnaryCall(
        method,
        options.meta ?? {},
        input,
        headers$.promise,
        response$.promise,
        status$.promise,
        trailers$.promise,
      );
    },

    interceptServerStreaming(next, method, input, options) {
      // Capture stack trace at call site before any async operations
      const callSiteStack = captureCallSiteStack();

      const outputStream = new RpcOutputStreamController();
      const serverStream = next(method, input, options);

      serverStream.responses.onNext((message, error, done) => {
        if (message) outputStream.notifyMessage(message);
        if (error) outputStream.notifyError(mapRpcError(error, options.abort, onError, callSiteStack));
        if (done) outputStream.notifyComplete();
      });

      return new ServerStreamingCall(
        method,
        options.meta ?? {},
        input,
        serverStream.headers,
        outputStream,
        serverStream.status,
        serverStream.trailers,
      );
    },

    interceptClientStreaming<I extends object, O extends object>(
      next: (method: MethodInfo<I, O>, options: RpcOptions) => ClientStreamingCall<I, O>,
      method: MethodInfo<I, O>,
      options: RpcOptions,
    ): ClientStreamingCall<I, O> {
      // Capture stack trace at call site before any async operations
      const callSiteStack = captureCallSiteStack();

      const call = next(method, options);

      const headersDeferred = new Deferred<RpcMetadata>();
      const responseDeferred = new Deferred<O>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();

      call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => headersDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));
      call.response.then((r) => responseDeferred.resolve(r)).catch((e) => responseDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));
      call.status.then((s) => statusDeferred.resolve(s)).catch((e) => statusDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));
      call.trailers.then((t) => trailersDeferred.resolve(t)).catch((e) => trailersDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));

      return new ClientStreamingCall<I, O>(
        method,
        options.meta ?? {},
        call.requests,
        headersDeferred.promise,
        responseDeferred.promise,
        statusDeferred.promise,
        trailersDeferred.promise,
      );
    },

    interceptDuplex<I extends object, O extends object>(
      next: (method: MethodInfo<I, O>, options: RpcOptions) => DuplexStreamingCall<I, O>,
      method: MethodInfo<I, O>,
      options: RpcOptions,
    ): DuplexStreamingCall<I, O> {
      // Capture stack trace at call site before any async operations
      const callSiteStack = captureCallSiteStack();

      const call = next(method, options);

      const headersDeferred = new Deferred<RpcMetadata>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();
      const outputStream = new RpcOutputStreamController<O>();

      call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => headersDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));
      call.status.then((s) => statusDeferred.resolve(s)).catch((e) => statusDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));
      call.trailers.then((t) => trailersDeferred.resolve(t)).catch((e) => trailersDeferred.reject(mapRpcError(e, options.abort, onError, callSiteStack)));

      call.responses.onNext((message, error, done) => {
        if (message) outputStream.notifyMessage(message);
        if (error) outputStream.notifyError(mapRpcError(error, options.abort, onError, callSiteStack));
        if (done) outputStream.notifyComplete();
      });

      return new DuplexStreamingCall<I, O>(
        method,
        options.meta ?? {},
        call.requests,
        headersDeferred.promise,
        outputStream,
        statusDeferred.promise,
        trailersDeferred.promise,
      );
    },
  };
}
