/**
 * Discriminated union of all supported Google RPC error detail types.
 * These map to the standard google.rpc error_details.proto types.
 */
export type ErrorDetail =
  | LocalizedMessageDetail
  | BadRequestDetail
  | DebugInfoDetail
  | ErrorInfoDetail
  | RetryInfoDetail
  | QuotaFailureDetail
  | PreconditionFailureDetail
  | RequestInfoDetail
  | ResourceInfoDetail
  | HelpDetail
  | UnknownDetail;

/**
 * Localized error message for display to users.
 * Maps to google.rpc.LocalizedMessage
 */
export interface LocalizedMessageDetail {
  readonly type: 'localizedMessage';
  readonly locale: string;
  readonly message: string;
}

/**
 * Details about invalid request fields.
 * Maps to google.rpc.BadRequest
 */
export interface BadRequestDetail {
  readonly type: 'badRequest';
  readonly fieldViolations: ReadonlyArray<{
    readonly field: string;
    readonly description: string;
  }>;
}

/**
 * Debug information for developers.
 * Maps to google.rpc.DebugInfo
 */
export interface DebugInfoDetail {
  readonly type: 'debugInfo';
  readonly stackEntries: ReadonlyArray<string>;
  readonly detail: string;
}

/**
 * Structured error information.
 * Maps to google.rpc.ErrorInfo
 */
export interface ErrorInfoDetail {
  readonly type: 'errorInfo';
  readonly reason: string;
  readonly domain: string;
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * Information about when to retry the request.
 * Maps to google.rpc.RetryInfo
 */
export interface RetryInfoDetail {
  readonly type: 'retryInfo';
  readonly retryDelaySeconds: number;
}

/**
 * Details about quota violations.
 * Maps to google.rpc.QuotaFailure
 */
export interface QuotaFailureDetail {
  readonly type: 'quotaFailure';
  readonly violations: ReadonlyArray<{
    readonly subject: string;
    readonly description: string;
  }>;
}

/**
 * Details about precondition failures.
 * Maps to google.rpc.PreconditionFailure
 */
export interface PreconditionFailureDetail {
  readonly type: 'preconditionFailure';
  readonly violations: ReadonlyArray<{
    readonly type: string;
    readonly subject: string;
    readonly description: string;
  }>;
}

/**
 * Information about the request for debugging.
 * Maps to google.rpc.RequestInfo
 */
export interface RequestInfoDetail {
  readonly type: 'requestInfo';
  readonly requestId: string;
  readonly servingData: string;
}

/**
 * Information about the resource that caused the error.
 * Maps to google.rpc.ResourceInfo
 */
export interface ResourceInfoDetail {
  readonly type: 'resourceInfo';
  readonly resourceType: string;
  readonly resourceName: string;
  readonly owner: string;
  readonly description: string;
}

/**
 * Links to documentation or help resources.
 * Maps to google.rpc.Help
 */
export interface HelpDetail {
  readonly type: 'help';
  readonly links: ReadonlyArray<{
    readonly description: string;
    readonly url: string;
  }>;
}

/**
 * Unknown or unsupported error detail type.
 * Preserves the raw data for custom handling.
 */
export interface UnknownDetail {
  readonly type: 'unknown';
  readonly typeUrl: string;
  readonly value: Uint8Array;
}

/**
 * Options for constructing a GrpcError.
 */
export interface GrpcErrorOptions {
  /**
   * Structured error details from google.rpc error_details.
   */
  readonly details?: ReadonlyArray<ErrorDetail>;

  /**
   * The original error that caused this error.
   */
  readonly cause?: unknown;
}
