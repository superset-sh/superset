import { ErrorCode } from "./error-codes";

export const errorCodeToHttpStatus: Record<ErrorCode, number> = {
  // 4xx Client Errors
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.AUTH_WEAK_PASSWORD]: 400,
  [ErrorCode.USER_PROFILE_INCOMPLETE]: 400,

  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
  [ErrorCode.AUTH_SESSION_EXPIRED]: 401,
  [ErrorCode.AUTH_TOKEN_INVALID]: 401,

  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.PERMISSION_DENIED]: 403,
  [ErrorCode.ADMIN_REQUIRED]: 403,
  [ErrorCode.OWNER_REQUIRED]: 403,
  [ErrorCode.AUTH_EMAIL_NOT_VERIFIED]: 403,
  [ErrorCode.AUTH_USER_DISABLED]: 403,

  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,

  [ErrorCode.COMMUNITY_NOT_FOUND]: 404,

  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 409,
  [ErrorCode.RESOURCE_CONFLICT]: 409,
  [ErrorCode.AUTH_EMAIL_ALREADY_EXISTS]: 409,
  [ErrorCode.ALREADY_MEMBER]: 409,
  [ErrorCode.NOT_MEMBER]: 409,
  [ErrorCode.DUPLICATE_VOTE]: 409,

  [ErrorCode.RATE_LIMITED]: 429,

  // 5xx Server Errors
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.PAYMENT_FAILED]: 502,
  [ErrorCode.EMAIL_SEND_FAILED]: 502,
};

/**
 * 에러 코드에 해당하는 HTTP 상태 코드 반환
 */
export function getHttpStatus(code: ErrorCode): number {
  return errorCodeToHttpStatus[code] ?? 500;
}
