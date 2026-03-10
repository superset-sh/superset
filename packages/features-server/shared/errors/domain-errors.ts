import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";

/**
 * 인증 관련 에러
 */
export class AuthError extends AppError {
  constructor(
    code: Extract<ErrorCode, `AUTH_${string}` | "UNAUTHORIZED">,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super({ code, message, context });
    this.name = "AuthError";
  }

  static invalidCredentials() {
    return new AuthError(
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      "이메일 또는 비밀번호가 올바르지 않습니다",
    );
  }

  static sessionExpired() {
    return new AuthError(
      ErrorCode.AUTH_SESSION_EXPIRED,
      "세션이 만료되었습니다. 다시 로그인해주세요",
    );
  }

  static emailAlreadyExists(email?: string) {
    return new AuthError(
      ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
      "이미 사용 중인 이메일입니다",
      email ? { email } : undefined,
    );
  }

  static emailNotVerified() {
    return new AuthError(ErrorCode.AUTH_EMAIL_NOT_VERIFIED, "이메일 인증이 필요합니다");
  }

  static userDisabled() {
    return new AuthError(ErrorCode.AUTH_USER_DISABLED, "비활성화된 계정입니다");
  }

  static unauthorized(message = "인증이 필요합니다") {
    return new AuthError(ErrorCode.UNAUTHORIZED, message);
  }
}

/**
 * 리소스 관련 에러
 */
export class ResourceError extends AppError {
  constructor(
    code: Extract<ErrorCode, `RESOURCE_${string}` | "NOT_FOUND">,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super({ code, message, context });
    this.name = "ResourceError";
  }

  static notFound(resourceType: string, id?: string) {
    return new ResourceError(
      ErrorCode.RESOURCE_NOT_FOUND,
      `${resourceType}을(를) 찾을 수 없습니다`,
      { resourceType, ...(id && { id }) },
    );
  }

  static alreadyExists(resourceType: string, identifier?: string) {
    return new ResourceError(
      ErrorCode.RESOURCE_ALREADY_EXISTS,
      `이미 존재하는 ${resourceType}입니다`,
      { resourceType, ...(identifier && { identifier }) },
    );
  }

  static conflict(message: string, context?: Record<string, unknown>) {
    return new ResourceError(ErrorCode.RESOURCE_CONFLICT, message, context);
  }
}

/**
 * 권한 관련 에러
 */
export class PermissionError extends AppError {
  constructor(
    code: Extract<
      ErrorCode,
      "PERMISSION_DENIED" | "ADMIN_REQUIRED" | "OWNER_REQUIRED" | "FORBIDDEN"
    >,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super({ code, message, context });
    this.name = "PermissionError";
  }

  static denied(message = "권한이 없습니다") {
    return new PermissionError(ErrorCode.PERMISSION_DENIED, message);
  }

  static adminRequired() {
    return new PermissionError(ErrorCode.ADMIN_REQUIRED, "관리자 권한이 필요합니다");
  }

  static ownerRequired(resourceType?: string) {
    return new PermissionError(
      ErrorCode.OWNER_REQUIRED,
      resourceType
        ? `${resourceType}의 소유자만 이 작업을 수행할 수 있습니다`
        : "소유자만 이 작업을 수행할 수 있습니다",
      resourceType ? { resourceType } : undefined,
    );
  }

  static forbidden(message = "접근이 거부되었습니다") {
    return new PermissionError(ErrorCode.FORBIDDEN, message);
  }
}

/**
 * 입력값 검증 에러
 */
export class ValidationError extends AppError {
  public readonly fields: Record<string, string[]>;

  constructor(fields: Record<string, string[]>, message = "입력값이 올바르지 않습니다") {
    super({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      context: { fields },
    });
    this.name = "ValidationError";
    this.fields = fields;
  }

  /**
   * Zod 에러를 ValidationError로 변환
   */
  static fromZodError(zodError: { errors: Array<{ path: (string | number)[]; message: string }> }) {
    const fields: Record<string, string[]> = {};

    for (const error of zodError.errors) {
      const path = error.path.join(".") || "root";
      if (!fields[path]) {
        fields[path] = [];
      }
      fields[path].push(error.message);
    }

    return new ValidationError(fields);
  }

  /**
   * 단일 필드 에러
   */
  static field(fieldName: string, message: string) {
    return new ValidationError({ [fieldName]: [message] });
  }
}

/**
 * 외부 서비스 에러
 */
export class ExternalServiceError extends AppError {
  constructor(
    serviceName: string,
    message: string,
    cause?: Error,
    context?: Record<string, unknown>,
  ) {
    super({
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      message,
      cause,
      context: { serviceName, ...context },
    });
    this.name = "ExternalServiceError";
  }

  static paymentFailed(provider: string, reason?: string) {
    return new ExternalServiceError(provider, reason || "결제 처리 중 오류가 발생했습니다");
  }

  static emailFailed(provider: string, reason?: string) {
    return new ExternalServiceError(provider, reason || "이메일 전송에 실패했습니다");
  }
}
