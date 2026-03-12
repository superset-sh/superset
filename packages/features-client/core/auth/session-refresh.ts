/**
 * Session Refresh Utility
 *
 * Better Auth handles session refresh automatically via cookies.
 * This module provides backward-compatible utilities.
 */
import { TOKEN_STORAGE_KEY } from "./store";

/**
 * No-op: Better Auth handles session refresh automatically
 * @deprecated Not needed with Better Auth
 */
export function setSupabaseForRefresh(_client: unknown) {
  // No-op: Better Auth handles session refresh automatically
}

/**
 * Trigger a session refresh by calling the Better Auth session endpoint
 */
export async function refreshSessionToken(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.session?.token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data.session.token));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * tRPC/TanStack Query 에러가 401(UNAUTHORIZED)인지 판별
 */
export function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  // TRPCClientError
  const trpcError = error as { data?: { code?: string }; shape?: { data?: { code?: string } } };
  if (trpcError.data?.code === "UNAUTHORIZED") return true;
  if (trpcError.shape?.data?.code === "UNAUTHORIZED") return true;

  // HTTP status 기반
  const httpError = error as { status?: number; statusCode?: number };
  if (httpError.status === 401 || httpError.statusCode === 401) return true;

  // message 기반 fallback
  const msgError = error as { message?: string };
  if (msgError.message?.includes("UNAUTHORIZED")) return true;

  return false;
}
