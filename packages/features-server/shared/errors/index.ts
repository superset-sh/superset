// 에러 코드
export { ErrorCode } from "./error-codes";
export type { ErrorCode as ErrorCodeType } from "./error-codes";

// HTTP 상태 매핑
export { errorCodeToHttpStatus, getHttpStatus } from "./http-status";

// 기본 에러 클래스
export { AppError, isAppError, isOperationalError } from "./app-error";
export type { AppErrorOptions } from "./app-error";

// 도메인별 에러 클래스
export {
  AuthError,
  ResourceError,
  PermissionError,
  ValidationError,
  ExternalServiceError,
} from "./domain-errors";
