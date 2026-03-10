// Re-export from new location for backwards compatibility
export {
  ErrorCode,
  AppError,
  isAppError,
  isOperationalError,
  AuthError,
  ResourceError,
  PermissionError,
  ValidationError,
  ExternalServiceError,
  errorCodeToHttpStatus,
  getHttpStatus,
} from "../errors";

export type { AppErrorOptions, ErrorCodeType } from "../errors";
