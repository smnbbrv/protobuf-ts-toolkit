import type { MethodInfo } from '@protobuf-ts/runtime-rpc';

export type LogLevel = 'debug' | 'info' | 'error';
export type CallType = 'unary' | 'serverStreaming' | 'clientStreaming' | 'duplex';

export interface LogContext {
  readonly method: MethodInfo;
  readonly callType: CallType;
  readonly level: LogLevel;
}

export interface BrowserLoggerConfig {
  /**
   * Filter which calls to log.
   * Return true to log, false to skip.
   * @default () => true
   */
  readonly shouldLog?: (context: LogContext) => boolean;

  /**
   * Log level to use.
   * @default 'debug'
   */
  readonly level?: LogLevel;
}
