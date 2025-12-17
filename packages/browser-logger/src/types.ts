import type { IMessageType } from '@protobuf-ts/runtime';
import type { MethodInfo } from '@protobuf-ts/runtime-rpc';

export type TypeRegistry = IMessageType<object>[] | undefined;
export type Verbosity = 'errors' | 'normal' | 'verbose';
export type CallType = 'unary' | 'serverStreaming' | 'clientStreaming' | 'duplex';

export interface VerbosityContext {
  readonly method: MethodInfo;
  readonly callType: CallType;
}

export type VerbosityProvider = Verbosity | ((context: VerbosityContext) => Verbosity);

export interface BrowserLoggerConfig {
  /**
   * Type registry for converting protobuf messages to JSON.
   */
  readonly typeRegistry?: TypeRegistry;

  /**
   * Verbosity level for logging.
   * Can be a static value or a function that returns verbosity based on context.
   * - 'errors': only log errors
   * - 'normal': log requests and responses
   * - 'verbose': log everything including streaming messages, method info, metadata
   * @default 'normal'
   */
  readonly verbosity?: VerbosityProvider;
}
