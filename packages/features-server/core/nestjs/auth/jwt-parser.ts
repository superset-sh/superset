import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

export interface JwtUser {
  id: string;
  email?: string;
  organizationIds?: string[];
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(baseUrl: string) {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${baseUrl}/api/auth/jwks`),
    );
  }
  return jwks;
}

/**
 * Authorization 헤더에서 JWT를 추출하고 JWKS로 서명 검증.
 * Better Auth JWT 플러그인이 발급한 RS256 토큰 기준.
 */
export async function parseJwtFromHeader(
  authHeader: string | undefined,
): Promise<JwtUser | undefined> {
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.slice(7);
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) return undefined;

  try {
    const { payload } = await jwtVerify(token, getJwks(baseUrl), {
      issuer: baseUrl,
      audience: baseUrl,
    });

    if (payload.sub) {
      return {
        id: payload.sub,
        email: (payload as JWTPayload & { email?: string }).email,
        organizationIds: (payload as JWTPayload & { organizationIds?: string[] }).organizationIds,
      };
    }
  } catch {
    // Invalid or expired token
  }

  return undefined;
}

/**
 * Fallback: 서명 검증 없이 JWT payload만 디코딩.
 * JWKS가 사용 불가능한 환경(테스트 등)에서 사용.
 */
export function parseJwtPayloadUnsafe(
  authHeader: string | undefined,
): JwtUser | undefined {
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  const token = authHeader.slice(7);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;

    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf-8"),
    );

    if (payload.sub && payload.exp && payload.exp > Date.now() / 1000) {
      return { id: payload.sub, email: payload.email, organizationIds: payload.organizationIds };
    }
  } catch {
    // Invalid token
  }

  return undefined;
}
