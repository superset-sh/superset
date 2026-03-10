import { ErrorCode } from "./error-codes";

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  cause?: Error;
  context?: Record<string, unknown>;
  isOperational?: boolean; // true: 예상된 에러, false: 시스템 에러
}

/**
 * 애플리케이션 공통 에러 클래스
 *
 * @example
 * throw new AppError({
 *   code: ErrorCode.USER_NOT_FOUND,
 *   message: '사용자를 찾을 수 없습니다',
 *   context: { userId: '123' },
 * });
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(options: AppErrorOptions) {
    super(options.message);

    this.name = "AppError";
    this.code = options.code;
    this.context = options.context;
    this.isOperational = options.isOperational ?? true;
    this.timestamp = new Date();

    // cause 체이닝 (ES2022+)
    if (options.cause) {
      this.cause = options.cause;
    }

    // 스택 트레이스 캡처 (V8 전용)
    if ("captureStackTrace" in Error) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 클라이언트에 전송할 안전한 형태로 변환
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.context && { details: this.sanitizeContext() }),
    };
  }

  /**
   * 민감한 정보 제거
   */
  private sanitizeContext(): Record<string, unknown> | undefined {
    if (!this.context) return undefined;

    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "apiKey",
      "authorization",
      "cookie",
      "session",
    ];
    const sanitized = { ...this.context };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }
}

/**
 * AppError 타입 가드
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 운영 에러인지 확인 (예상된 비즈니스 에러)
 */
export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}
