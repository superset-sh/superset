import type { User } from "../../trpc/trpc";

/**
 * Authorization 헤더에서 JWT를 추출하고 파싱하여 User 객체를 반환.
 * 서명 검증 없이 페이로드만 디코딩 (Supabase JWT 기준).
 */
export function parseJwtFromHeader(
  authHeader: string | undefined,
): User | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.slice(7);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;

    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf-8"),
    );

    if (payload.sub && payload.exp && payload.exp > Date.now() / 1000) {
      return { id: payload.sub, email: payload.email };
    }
  } catch {
    // Invalid token
  }

  return undefined;
}
