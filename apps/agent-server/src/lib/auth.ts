import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";

export type AuthUser = { id: string; email?: string; role?: string };

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * HMAC-SHA256 서명을 검증한 뒤 JWT 페이로드를 반환.
 * SUPABASE_JWT_SECRET 미설정 시 서명 검증을 건너뜀 (개발 환경).
 */
export function parseJwtFromHeader(
  authHeader: string | undefined,
): AuthUser | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.slice(7);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;

    // 서명 검증 (SUPABASE_JWT_SECRET 설정된 경우)
    if (JWT_SECRET) {
      const signingInput = `${parts[0]}.${parts[1]}`;
      const expected = createHmac("sha256", JWT_SECRET)
        .update(signingInput)
        .digest();
      const actual = Buffer.from(parts[2]!, "base64url");
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        return undefined;
      }
    }

    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf-8"),
    );

    if (payload.sub && payload.exp && payload.exp > Date.now() / 1000) {
      return { id: payload.sub, email: payload.email, role: payload.role };
    }
  } catch {
    // Invalid token
  }

  return undefined;
}

/** JWT 인증 미들웨어 — 인증 실패 시 401 */
export async function authMiddleware(c: Context, next: Next) {
  const authorization = c.req.header("Authorization");
  const user = parseJwtFromHeader(authorization);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  await next();
}

/** 컨텍스트에서 인증된 유저 가져오기 */
export function getUser(c: Context): AuthUser {
  return c.get("user") as AuthUser;
}
