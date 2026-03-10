import { initTRPC, TRPCError } from "@trpc/server";
import type { AuthUser } from "../lib/auth";
import { parseJwtFromHeader } from "../lib/auth";

// ============================================================================
// Context
// ============================================================================

export interface TRPCContext {
  user: AuthUser | null;
}

export function createContext(req: Request): TRPCContext {
  const authorization = req.headers.get("Authorization");
  const user = parseJwtFromHeader(authorization ?? undefined);
  return { user: user ?? null };
}

// ============================================================================
// tRPC Instance
// ============================================================================

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message: error.message,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** 인증 필수 프로시저 */
export const authProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** 관리자 전용 프로시저 */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const role = ctx.user.role;
  if (role !== "admin" && role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
