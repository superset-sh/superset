import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "../create-logger";

const EXCLUDED_PATHS = ["/health", "/api/health"];

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private logger = createLogger("http");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url, headers } = request;

    // health check 제외
    if (EXCLUDED_PATHS.some((p) => url.startsWith(p))) {
      return next.handle();
    }

    const requestId = request.id ?? crypto.randomUUID();
    const startTime = Date.now();
    const user = (request as any).user;
    const sessionId = headers["x-posthog-session-id"] as string | undefined;

    // 하위에서 사용할 수 있도록 request에 주입
    (request as any).requestId = requestId;

    // 성공 요청만 로깅. 에러는 GlobalExceptionFilter가 전담
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<FastifyReply>();
        const duration = Date.now() - startTime;

        this.logger.info("Request completed", {
          "request.id": requestId,
          "http.method": method,
          "http.route": url,
          "http.status_code": response.statusCode,
          "http.duration_ms": duration,
          "user.id": user?.id,
          "user.role": user?.role,
          "session.id": sessionId,
          "posthog.distinct_id": user?.id,
        });
      }),
    );
  }
}
