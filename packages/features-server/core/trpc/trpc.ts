import { initTRPC, TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { HttpException } from "@nestjs/common";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { DrizzleDB } from "@superbuilder/drizzle";

/**
 * User type for authenticated requests
 */
export interface User {
  id: string;
  email?: string;
  role?: string;
  roleIds?: string[]; // Added for RBAC support
  // Add other user fields as needed
}

/**
 * Base tRPC Context type
 * Includes Fastify request/response and database
 * Apps can extend this for additional fields
 */
export interface BaseTRPCContext extends CreateFastifyContextOptions {
  db: DrizzleDB;
  user?: User;
  // Services (injected by NestJS)
  roleService?: any;
  permissionService?: any;
  authService?: any;
  // Additional context fields can be added by apps
}

/**
 * Base tRPC configuration with context
 */
const t = initTRPC.context<BaseTRPCContext>().create({
  errorFormatter({ shape, error, ctx }) {
    return {
      ...shape,
      message: error.message,
      data: {
        ...shape.data,
        requestId: ctx?.req?.id,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;

/**
 * NestJS HttpException / 일반 Error → TRPCError 자동 변환 미들웨어
 * 모든 프로시저에 적용되어 에러 메시지가 클라이언트에 정확히 전달됨
 *
 * tRPC v11에서는 callRecursive가 각 미들웨어 레벨에서 에러를 catch하여
 * { ok: false, error: TRPCError(INTERNAL_SERVER_ERROR) }로 변환하므로,
 * catch 블록에 원본 HttpException이 도달하지 않습니다.
 * 대신 result.ok를 검사하고 result.error.cause에서 원본 에러를 확인합니다.
 */
const errorTranslator = middleware(async ({ next }) => {
  const result = await next();

  if (!result.ok) {
    const cause = result.error.cause;

    // cause에 원본 NestJS HttpException이 보존되어 있으면 올바른 코드로 재매핑
    if (cause instanceof HttpException) {
      const status = cause.getStatus();
      const code = HTTP_TO_TRPC[status] ?? "INTERNAL_SERVER_ERROR";

      // 이미 올바른 코드면 그대로 반환
      if (result.error.code === code) {
        return result;
      }

      throw new TRPCError({
        code,
        message: cause.message,
        cause,
      });
    }
  }

  return result;
});

export const publicProcedure = t.procedure.use(errorTranslator);

/**
 * Auth middleware - ctx.user가 존재하는지 확인
 * user는 createContext에서 토큰 검증 후 설정됨
 */
const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "인증이 필요합니다." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const authProcedure = publicProcedure.use(isAuthed);
export const protectedProcedure = publicProcedure.use(isAuthed);


/**
 * authProcedure 핸들러에서 인증된 사용자 ID를 추출
 * authProcedure 미들웨어가 ctx.user 존재를 보장하므로 안전하게 사용 가능
 */
export function getAuthUserId(ctx: BaseTRPCContext): string {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "인증이 필요합니다." });
  }
  return ctx.user.id;
}

// NestJS HTTP status → tRPC error code 매핑
const HTTP_TO_TRPC: Record<number, TRPC_ERROR_CODE_KEY> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_SUPPORTED",
  408: "TIMEOUT",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  429: "TOO_MANY_REQUESTS",
  499: "CLIENT_CLOSED_REQUEST",
  500: "INTERNAL_SERVER_ERROR",
  502: "BAD_GATEWAY" as TRPC_ERROR_CODE_KEY,
  503: "INTERNAL_SERVER_ERROR",
};
