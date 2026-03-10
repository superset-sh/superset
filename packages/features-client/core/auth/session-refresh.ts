/**
 * Session Refresh Utility
 *
 * 401 에러 발생 시 Supabase 세션을 갱신하고 토큰을 업데이트한다.
 * 여러 요청이 동시에 401을 받아도 갱신은 1회만 수행한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TOKEN_STORAGE_KEY } from "./store";

let refreshPromise: Promise<boolean> | null = null;
let supabaseRef: SupabaseClient | null = null;

/**
 * Supabase 클라이언트 등록 (앱 초기화 시 1회 호출)
 */
export function setSupabaseForRefresh(client: SupabaseClient) {
  supabaseRef = client;
}

/**
 * 세션 갱신 시도 (중복 호출 방지, 동시 요청은 하나의 Promise 공유)
 * @returns 갱신 성공 여부
 */
export async function refreshSessionToken(): Promise<boolean> {
  if (!supabaseRef) return false;

  // 이미 갱신 중이면 기존 Promise 공유
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabaseRef!.auth.refreshSession();
      if (error || !data.session) {
        return false;
      }

      // localStorage 직접 업데이트 (tRPC getAuthHeaders가 읽는 곳)
      localStorage.setItem(
        TOKEN_STORAGE_KEY,
        JSON.stringify(data.session.access_token),
      );

      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
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
