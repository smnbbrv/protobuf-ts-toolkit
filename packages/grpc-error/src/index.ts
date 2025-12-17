// Error classes
export {
  AbortedError,
  AlreadyExistsError,
  DeadlineExceededError,
  GrpcError,
  NotFoundError,
  PermissionDeniedError,
  RaceUpdateError,
  UnauthenticatedError,
  UnavailableError,
  UnknownError,
  ValidationError,
} from './errors.js';

// Types
export type {
  BadRequestDetail,
  DebugInfoDetail,
  ErrorDetail,
  ErrorInfoDetail,
  GrpcErrorOptions,
  HelpDetail,
  LocalizedMessageDetail,
  PreconditionFailureDetail,
  QuotaFailureDetail,
  RequestInfoDetail,
  ResourceInfoDetail,
  RetryInfoDetail,
  UnknownDetail,
} from './types.js';

// Codec
export { decodeGrpcStatus, encodeGrpcStatus, type DecodedGrpcStatus } from './codec/index.js';

// Interceptor
export { createErrorInterceptor, type ErrorInterceptorConfig } from './interceptor.js';
