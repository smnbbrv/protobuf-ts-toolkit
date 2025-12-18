import type { MethodInfo, RpcInterceptor, RpcMetadata, RpcStatus } from '@protobuf-ts/runtime-rpc';
import {
  ClientStreamingCall,
  Deferred,
  DuplexStreamingCall,
  RpcError,
  RpcOutputStreamController,
  ServerStreamingCall,
  UnaryCall,
} from '@protobuf-ts/runtime-rpc';
import type { BrowserLoggerConfig, CallType, Verbosity } from './types.js';

const streamStyle = 'color: #9752cc;';
const dataStyle = 'color: #5c7ced;';
const errorStyle = 'color: #f00505;';
const cancelledStyle = 'color: #999;text-decoration: line-through;';

let requestId = 0;

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function safeLogs(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    console.error('Failed printing log', e);
    console.groupEnd();
  }
}

const verbosityLevels: Record<Verbosity, number> = {
  errors: 0,
  normal: 1,
  verbose: 2,
};

export function createBrowserLogger(config: BrowserLoggerConfig = {}): RpcInterceptor {
  const { typeRegistry, verbosity = 'normal' } = config;
  const jsonOpts = typeRegistry ? { typeRegistry } : undefined;

  const getVerbosity = (method: MethodInfo, callType: CallType): Verbosity => {
    if (typeof verbosity === 'function') {
      return verbosity({ method, callType });
    }
    return verbosity;
  };

  const canLog = (method: MethodInfo, callType: CallType, requiredLevel: Verbosity): boolean => {
    const currentVerbosity = getVerbosity(method, callType);
    return verbosityLevels[currentVerbosity] >= verbosityLevels[requiredLevel];
  };

  return {
    interceptUnary(next, method, input, options) {
      const headers$ = new Deferred<RpcMetadata>();
      const response$ = new Deferred<object>();
      const status$ = new Deferred<RpcStatus>();
      const trailers$ = new Deferred<RpcMetadata>();

      const id = ++requestId;
      const start = Date.now();

      const openGroup = (style: string) =>
        console.groupCollapsed(`%c#${id}: ${Date.now() - start}ms -> ${method.service.typeName}/${method.name}`, style);
      const printSettings = (style: string) => console.log('%csc', style, method);
      const printMetadata = (style: string) => console.log('%c**', style, options);
      const printRequest = (style: string) => console.log('%c>>', style, method.I.toJson(input, jsonOpts));
      const closeGroup = () => console.groupEnd();

      (async () => {
        try {
          const res = await next(method, input, options);

          headers$.resolve(res.headers);
          response$.resolve(res.response);
          status$.resolve(res.status);
          trailers$.resolve(res.trailers);

          const failed = res.status.code !== 'OK';
          const style = failed ? errorStyle : dataStyle;

          if (canLog(method, 'unary', 'normal')) {
            safeLogs(() => {
              openGroup(dataStyle);
              if (canLog(method, 'unary', 'verbose')) {
                printSettings(dataStyle);
              }
              printRequest(dataStyle);
              if (canLog(method, 'unary', 'verbose')) {
                printMetadata(dataStyle);
              }
              console.log('%c<<', style, method.O.toJson(res.response, jsonOpts));
              closeGroup();
            });
          }
        } catch (e) {
          headers$.reject(e);
          response$.reject(e);
          status$.reject(e);
          trailers$.reject(e);

          let style = errorStyle;

          if ((e instanceof RpcError && e.code === 'CANCELLED') || options.abort?.aborted) {
            style = cancelledStyle;
          }

          if (canLog(method, 'unary', 'errors')) {
            safeLogs(() => {
              openGroup(style);
              if (canLog(method, 'unary', 'verbose')) {
                printSettings(style);
              }
              printRequest(style);
              if (canLog(method, 'unary', 'verbose')) {
                printMetadata(style);
              }
              console.log('%c<<', style, e instanceof RpcError ? `${e.code}: ${e.message}` : e);
              closeGroup();
            });
          }
        }
      })();

      return new UnaryCall<object, object>(
        method as MethodInfo<object, object>,
        options.meta ?? {},
        input,
        headers$.promise,
        response$.promise,
        status$.promise,
        trailers$.promise,
      );
    },

    interceptServerStreaming(next, method, input, options) {
      const id = ++requestId;

      const openGroup = (style: string) =>
        console.groupCollapsed(
          `%c#${id}: ${formatTime(new Date())} -> ${method.service.typeName}/${method.name}`,
          style,
        );
      const printSettings = (style: string) => console.log('%csc', style, method);
      const printMetadata = (style: string) => console.log('%c**', style, options);
      const printRequest = (style: string) => console.log('%c>>', style, method.I.toJson(input, jsonOpts));
      const closeGroup = () => console.groupEnd();

      if (canLog(method, 'serverStreaming', 'normal')) {
        safeLogs(() => {
          openGroup(streamStyle);
          if (canLog(method, 'serverStreaming', 'verbose')) {
            printSettings(streamStyle);
          }
          printRequest(streamStyle);
          if (canLog(method, 'serverStreaming', 'verbose')) {
            printMetadata(streamStyle);
          }
          closeGroup();
        });
      }

      const outputStream = new RpcOutputStreamController<object>();
      const serverStream = next(method, input, options);

      serverStream.responses.onNext((message, error, done) => {
        if (message) {
          if (canLog(method, 'serverStreaming', 'normal')) {
            safeLogs(() => {
              openGroup(streamStyle);
              console.log('%c<<', streamStyle, method.O.toJson(message, jsonOpts));
              closeGroup();
            });
          }

          outputStream.notifyMessage(message);
        }

        if (error) {
          let style = errorStyle;

          if ((error instanceof RpcError && error.code === 'CANCELLED') || options.abort?.aborted) {
            style = cancelledStyle;
          }

          if (canLog(method, 'serverStreaming', 'errors')) {
            safeLogs(() => {
              openGroup(style);
              console.log('%c<<', style, error instanceof RpcError ? `${error.code}: ${error.message}` : error);
              closeGroup();
            });
          }

          outputStream.notifyError(error);
        }

        if (done) outputStream.notifyComplete();
      });

      return new ServerStreamingCall(
        method as MethodInfo<object, object>,
        options.meta ?? {},
        input,
        serverStream.headers,
        outputStream,
        serverStream.status,
        serverStream.trailers,
      );
    },

    interceptClientStreaming<I extends object, O extends object>(
      next: (
        method: MethodInfo<I, O>,
        options: { meta?: RpcMetadata; abort?: AbortSignal },
      ) => ClientStreamingCall<I, O>,
      method: MethodInfo<I, O>,
      options: { meta?: RpcMetadata; abort?: AbortSignal },
    ): ClientStreamingCall<I, O> {
      const id = ++requestId;
      const call = next(method, options);

      const openGroup = (style: string) =>
        console.groupCollapsed(
          `%c#${id}: ${formatTime(new Date())} -> ${method.service.typeName}/${method.name} [client-stream]`,
          style,
        );
      const printSettings = (style: string) => console.log('%csc', style, method);
      const printMetadata = (style: string) => console.log('%c**', style, options);
      const closeGroup = () => console.groupEnd();

      if (canLog(method, 'clientStreaming', 'normal')) {
        safeLogs(() => {
          openGroup(streamStyle);
          if (canLog(method, 'clientStreaming', 'verbose')) {
            printSettings(streamStyle);
          }
          console.log('%c>>', streamStyle, 'client streaming started');
          if (canLog(method, 'clientStreaming', 'verbose')) {
            printMetadata(streamStyle);
          }
          closeGroup();
        });
      }

      const headersDeferred = new Deferred<RpcMetadata>();
      const responseDeferred = new Deferred<O>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();

      call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => headersDeferred.reject(e));
      call.response
        .then((r) => {
          if (canLog(method, 'clientStreaming', 'normal')) {
            safeLogs(() => {
              openGroup(streamStyle);
              console.log('%c<<', streamStyle, method.O.toJson(r, jsonOpts));
              closeGroup();
            });
          }
          responseDeferred.resolve(r);
        })
        .catch((e) => {
          if (canLog(method, 'clientStreaming', 'errors')) {
            safeLogs(() => {
              openGroup(errorStyle);
              console.log('%c<<', errorStyle, e instanceof RpcError ? `${e.code}: ${e.message}` : e);
              closeGroup();
            });
          }
          responseDeferred.reject(e);
        });
      call.status.then((s) => statusDeferred.resolve(s)).catch((e) => statusDeferred.reject(e));
      call.trailers.then((t) => trailersDeferred.resolve(t)).catch((e) => trailersDeferred.reject(e));

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
      next: (
        method: MethodInfo<I, O>,
        options: { meta?: RpcMetadata; abort?: AbortSignal },
      ) => DuplexStreamingCall<I, O>,
      method: MethodInfo<I, O>,
      options: { meta?: RpcMetadata; abort?: AbortSignal },
    ): DuplexStreamingCall<I, O> {
      const id = ++requestId;
      const call = next(method, options);

      const openGroup = (style: string) =>
        console.groupCollapsed(
          `%c#${id}: ${formatTime(new Date())} -> ${method.service.typeName}/${method.name} [duplex]`,
          style,
        );
      const printSettings = (style: string) => console.log('%csc', style, method);
      const printMetadata = (style: string) => console.log('%c**', style, options);
      const closeGroup = () => console.groupEnd();

      if (canLog(method, 'duplex', 'normal')) {
        safeLogs(() => {
          openGroup(streamStyle);
          if (canLog(method, 'duplex', 'verbose')) {
            printSettings(streamStyle);
          }
          console.log('%c<>', streamStyle, 'duplex streaming started');
          if (canLog(method, 'duplex', 'verbose')) {
            printMetadata(streamStyle);
          }
          closeGroup();
        });
      }

      const headersDeferred = new Deferred<RpcMetadata>();
      const statusDeferred = new Deferred<RpcStatus>();
      const trailersDeferred = new Deferred<RpcMetadata>();
      const outputStream = new RpcOutputStreamController<O>();

      call.headers.then((h) => headersDeferred.resolve(h)).catch((e) => headersDeferred.reject(e));
      call.status.then((s) => statusDeferred.resolve(s)).catch((e) => statusDeferred.reject(e));
      call.trailers.then((t) => trailersDeferred.resolve(t)).catch((e) => trailersDeferred.reject(e));

      call.responses.onNext((message, error, done) => {
        if (message) {
          if (canLog(method, 'duplex', 'normal')) {
            safeLogs(() => {
              openGroup(streamStyle);
              console.log('%c<<', streamStyle, method.O.toJson(message, jsonOpts));
              closeGroup();
            });
          }
          outputStream.notifyMessage(message);
        }

        if (error) {
          if (canLog(method, 'duplex', 'errors')) {
            safeLogs(() => {
              openGroup(errorStyle);
              console.log('%c<<', errorStyle, error instanceof RpcError ? `${error.code}: ${error.message}` : error);
              closeGroup();
            });
          }
          outputStream.notifyError(error);
        }

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
