import { context, propagation, SpanKind, SpanStatusCode, trace, type Span, type SpanOptions } from '@opentelemetry/api';
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

/**
 * OpenTelemetry semantic convention attributes for RPC.
 * Using string literals to avoid requiring the semantic-conventions package.
 */
const ATTR_RPC_SYSTEM = 'rpc.system';
const ATTR_RPC_SERVICE = 'rpc.service';
const ATTR_RPC_METHOD = 'rpc.method';
const ATTR_RPC_GRPC_STATUS_CODE = 'rpc.grpc.status_code';

/**
 * Configuration for the OpenTelemetry interceptor.
 */
export interface OtelConfig {
  /**
   * Name for the tracer. Each library should have its own unique name.
   * @default '@protobuf-ts-toolkit/opentelemetry'
   */
  tracerName?: string;

  /**
   * Optional function to customize span names.
   * @default `grpc.{serviceName}/{methodName}`
   */
  spanNameFormatter?: (method: MethodInfo, callType: string) => string;
}

/**
 * Default span name formatter.
 */
function defaultSpanNameFormatter(method: MethodInfo, _callType: string): string {
  return `grpc.${method.service.typeName}/${method.name}`;
}

/**
 * Inject trace context into metadata using W3C Trace Context propagation.
 */
function injectTraceContext(meta: RpcMetadata): RpcMetadata {
  const output: Record<string, string> = {};
  propagation.inject(context.active(), output);
  return { ...meta, ...output };
}

/**
 * Set span attributes from RPC error.
 */
function setSpanError(span: Span, error: unknown): void {
  if (error instanceof RpcError) {
    span.setAttribute(ATTR_RPC_GRPC_STATUS_CODE, error.code);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else if (error instanceof Error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

/**
 * Creates an OpenTelemetry interceptor for gRPC calls.
 *
 * The interceptor:
 * - Creates spans for all gRPC call types
 * - Sets semantic convention attributes (rpc.system, rpc.service, rpc.method)
 * - Automatically propagates trace context via W3C Trace Context headers
 * - Sets span status based on call success/failure
 *
 * @example
 * ```typescript
 * const otelInterceptor = createOtelInterceptor();
 *
 * // Or with custom tracer name
 * const otelInterceptor = createOtelInterceptor({
 *   tracerName: 'my-grpc-client',
 * });
 *
 * const transport = new GrpcTransport({
 *   host: 'localhost:50051',
 *   interceptors: [otelInterceptor],
 * });
 * ```
 */
export function createOtelInterceptor(config: OtelConfig = {}): RpcInterceptor {
  const { tracerName = '@protobuf-ts-toolkit/opentelemetry', spanNameFormatter = defaultSpanNameFormatter } = config;

  const tracer = trace.getTracer(tracerName);

  function createSpanOptions(method: MethodInfo): SpanOptions {
    return {
      attributes: {
        [ATTR_RPC_SYSTEM]: 'grpc',
        [ATTR_RPC_SERVICE]: method.service.typeName,
        [ATTR_RPC_METHOD]: `/${method.service.typeName}/${method.name}`,
      },
      kind: SpanKind.CLIENT,
    };
  }

  return {
    interceptUnary(next, method, input, options) {
      const headers$ = new Deferred<RpcMetadata>();
      const response$ = new Deferred<object>();
      const status$ = new Deferred<RpcStatus>();
      const trailers$ = new Deferred<RpcMetadata>();

      const spanOptions = createSpanOptions(method);
      const spanName = spanNameFormatter(method, 'unary');

      tracer.startActiveSpan(spanName, spanOptions, (span) => {
        (async () => {
          try {
            const meta = injectTraceContext(options.meta ?? {});
            const res = await next(method, input, { ...options, meta });

            headers$.resolve(res.headers);
            response$.resolve(res.response);
            status$.resolve(res.status);
            trailers$.resolve(res.trailers);

            span.setAttribute(ATTR_RPC_GRPC_STATUS_CODE, res.status.code);
            span.setStatus({ code: SpanStatusCode.OK });
          } catch (e) {
            setSpanError(span, e);
            headers$.reject(e);
            response$.reject(e);
            status$.reject(e);
            trailers$.reject(e);
          } finally {
            span.end();
          }
        })();
      });

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
      const outputStream = new RpcOutputStreamController();
      const headersDeferred = new Deferred<RpcMetadata>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();

      const spanOptions = createSpanOptions(method);
      const spanName = spanNameFormatter(method, 'serverStreaming');

      tracer.startActiveSpan(spanName, spanOptions, (span) => {
        const meta = injectTraceContext(options.meta ?? {});
        const call = next(method, input, { ...options, meta });

        call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => {
          setSpanError(span, e);
          headersDeferred.reject(e);
        });

        call.status.then((s) => {
          span.setAttribute(ATTR_RPC_GRPC_STATUS_CODE, s.code);
          span.setStatus({ code: SpanStatusCode.OK });
          statusDeferred.resolve(s);
        }).catch((e) => {
          setSpanError(span, e);
          statusDeferred.reject(e);
        });

        call.trailers.then((t) => {
          trailersDeferred.resolve(t);
          span.end();
        }).catch((e) => {
          trailersDeferred.reject(e);
          span.end();
        });

        call.responses.onNext((message, error, done) => {
          if (message) outputStream.notifyMessage(message);
          if (error) {
            setSpanError(span, error);
            outputStream.notifyError(error);
          }
          if (done) outputStream.notifyComplete();
        });
      });

      return new ServerStreamingCall(
        method,
        options.meta ?? {},
        input,
        headersDeferred.promise,
        outputStream,
        statusDeferred.promise,
        trailersDeferred.promise,
      );
    },

    interceptClientStreaming<I extends object, O extends object>(
      next: (method: MethodInfo<I, O>, options: RpcOptions) => ClientStreamingCall<I, O>,
      method: MethodInfo<I, O>,
      options: RpcOptions,
    ): ClientStreamingCall<I, O> {
      const headersDeferred = new Deferred<RpcMetadata>();
      const responseDeferred = new Deferred<O>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();

      const spanOptions = createSpanOptions(method);
      const spanName = spanNameFormatter(method, 'clientStreaming');

      let call: ClientStreamingCall<I, O>;

      tracer.startActiveSpan(spanName, spanOptions, (span) => {
        const meta = injectTraceContext(options.meta ?? {});
        call = next(method, { ...options, meta });

        call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => {
          setSpanError(span, e);
          headersDeferred.reject(e);
        });

        call.response.then((r) => responseDeferred.resolve(r)).catch((e) => {
          setSpanError(span, e);
          responseDeferred.reject(e);
        });

        call.status.then((s) => {
          span.setAttribute(ATTR_RPC_GRPC_STATUS_CODE, s.code);
          span.setStatus({ code: SpanStatusCode.OK });
          statusDeferred.resolve(s);
        }).catch((e) => {
          setSpanError(span, e);
          statusDeferred.reject(e);
        });

        call.trailers.then((t) => {
          trailersDeferred.resolve(t);
          span.end();
        }).catch((e) => {
          trailersDeferred.reject(e);
          span.end();
        });
      });

      return new ClientStreamingCall<I, O>(
        method,
        options.meta ?? {},
        call!.requests,
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
      const headersDeferred = new Deferred<RpcMetadata>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();
      const outputStream = new RpcOutputStreamController<O>();

      const spanOptions = createSpanOptions(method);
      const spanName = spanNameFormatter(method, 'duplex');

      let call: DuplexStreamingCall<I, O>;

      tracer.startActiveSpan(spanName, spanOptions, (span) => {
        const meta = injectTraceContext(options.meta ?? {});
        call = next(method, { ...options, meta });

        call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => {
          setSpanError(span, e);
          headersDeferred.reject(e);
        });

        call.status.then((s) => {
          span.setAttribute(ATTR_RPC_GRPC_STATUS_CODE, s.code);
          span.setStatus({ code: SpanStatusCode.OK });
          statusDeferred.resolve(s);
        }).catch((e) => {
          setSpanError(span, e);
          statusDeferred.reject(e);
        });

        call.trailers.then((t) => {
          trailersDeferred.resolve(t);
          span.end();
        }).catch((e) => {
          trailersDeferred.reject(e);
          span.end();
        });

        call.responses.onNext((message, error, done) => {
          if (message) outputStream.notifyMessage(message);
          if (error) {
            setSpanError(span, error);
            outputStream.notifyError(error);
          }
          if (done) outputStream.notifyComplete();
        });
      });

      return new DuplexStreamingCall<I, O>(
        method,
        options.meta ?? {},
        call!.requests,
        headersDeferred.promise,
        outputStream,
        statusDeferred.promise,
        trailersDeferred.promise,
      );
    },
  };
}
