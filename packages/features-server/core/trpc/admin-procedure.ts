/**
 * Admin Procedure for tRPC
 *
 * 인증 + admin/owner 역할 확인 미들웨어
 * drizzle import를 trpc.ts에서 분리하여 타입 추론 오류 방지
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { userRoles, roles } from "@superbuilder/drizzle";
import { middleware, authProcedure } from "./trpc";

const ADMIN_ROLE_SLUGS = ["owner", "admin"];

const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "인증이 필요합니다." });
  }

  let hasAdminRole = false;

  try {
    const result = await ctx.db
      .select({ slug: roles.slug })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, ctx.user.id))
      .limit(10);

    hasAdminRole = result.some((r) => ADMIN_ROLE_SLUGS.includes(r.slug));
  } catch {
    // user_roles/roles 테이블 미생성 시 안전하게 거부
    hasAdminRole = false;
  }

  if (!hasAdminRole) {
    throw new TRPCError({ code: "FORBIDDEN", message: "관리자 권한이 필요합니다." });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = authProcedure.use(isAdmin);
