import type { RpcInterceptor, MethodInfo } from '@protobuf-ts/runtime-rpc';
import type { BrowserLoggerConfig, LogContext, LogLevel } from './types.js';

function getMethodPath(method: MethodInfo): string {
  return `${method.service.typeName}/${method.name}`;
}

function log(level: LogLevel, ...args: unknown[]): void {
  switch (level) {
    case 'debug':
      console.debug(...args);
      break;
    case 'info':
      console.info(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
}

/**
 * Creates an interceptor that logs gRPC calls to the browser console.
 *
 * @example
 * ```typescript
 * const transport = new GrpcWebFetchTransport({
 *   baseUrl: 'https://api.example.com',
 *   interceptors: [createBrowserLogger()],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Only log errors
 * createBrowserLogger({
 *   level: 'error',
 *   shouldLog: ({ callType }) => callType === 'unary',
 * });
 * ```
 */
export function createBrowserLogger(config: BrowserLoggerConfig = {}): RpcInterceptor {
  const { shouldLog = () => true, level = 'debug' } = config;

  return {
    interceptUnary(next, method, input, options) {
      const context: LogContext = { method, callType: 'unary', level };

      if (!shouldLog(context)) {
        return next(method, input, options);
      }

      const path = getMethodPath(method);
      const startTime = performance.now();

      log(level, `[gRPC] → ${path}`, input);

      const call = next(method, input, options);

      call.then(
        (result) => {
          const duration = (performance.now() - startTime).toFixed(1);
          log(level, `[gRPC] ← ${path} (${duration}ms)`, result.response);
        },
        (error) => {
          const duration = (performance.now() - startTime).toFixed(1);
          console.error(`[gRPC] ✗ ${path} (${duration}ms)`, error);
        },
      );

      return call;
    },

    interceptServerStreaming(next, method, input, options) {
      const context: LogContext = { method, callType: 'serverStreaming', level };

      if (!shouldLog(context)) {
        return next(method, input, options);
      }

      const path = getMethodPath(method);
      const startTime = performance.now();

      log(level, `[gRPC] → ${path} (stream)`, input);

      const call = next(method, input, options);

      call.responses.onMessage((message) => {
        const elapsed = (performance.now() - startTime).toFixed(1);
        log(level, `[gRPC] ↓ ${path} (+${elapsed}ms)`, message);
      });

      call.responses.onError((error) => {
        const duration = (performance.now() - startTime).toFixed(1);
        console.error(`[gRPC] ✗ ${path} (${duration}ms)`, error);
      });

      call.responses.onComplete(() => {
        const duration = (performance.now() - startTime).toFixed(1);
        log(level, `[gRPC] ← ${path} complete (${duration}ms)`);
      });

      return call;
    },

    interceptClientStreaming(next, method, options) {
      const context: LogContext = { method, callType: 'clientStreaming', level };

      if (!shouldLog(context)) {
        return next(method, options);
      }

      const path = getMethodPath(method);
      const startTime = performance.now();

      log(level, `[gRPC] → ${path} (client stream)`);

      const call = next(method, options);

      call.then(
        (result) => {
          const duration = (performance.now() - startTime).toFixed(1);
          log(level, `[gRPC] ← ${path} (${duration}ms)`, result.response);
        },
        (error) => {
          const duration = (performance.now() - startTime).toFixed(1);
          console.error(`[gRPC] ✗ ${path} (${duration}ms)`, error);
        },
      );

      return call;
    },

    interceptDuplex(next, method, options) {
      const context: LogContext = { method, callType: 'duplex', level };

      if (!shouldLog(context)) {
        return next(method, options);
      }

      const path = getMethodPath(method);
      const startTime = performance.now();

      log(level, `[gRPC] ↔ ${path} (duplex)`);

      const call = next(method, options);

      call.responses.onMessage((message) => {
        const elapsed = (performance.now() - startTime).toFixed(1);
        log(level, `[gRPC] ↓ ${path} (+${elapsed}ms)`, message);
      });

      call.responses.onError((error) => {
        const duration = (performance.now() - startTime).toFixed(1);
        console.error(`[gRPC] ✗ ${path} (${duration}ms)`, error);
      });

      call.responses.onComplete(() => {
        const duration = (performance.now() - startTime).toFixed(1);
        log(level, `[gRPC] ← ${path} complete (${duration}ms)`);
      });

      return call;
    },
  };
}
