/**
 * Auth State Sync Hook
 *
 * Supabase 인증 상태 변화를 감지하여 sessionAtom을 동기화
 * 만료 5분 전 proactive refresh 포함
 */
import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { identifyUser, resetUser } from "../../analytics/posthog-provider";
import { sessionAtom, supabaseAtom } from "../store";

/** 만료 5분 전에 proactive refresh */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Supabase onAuthStateChange를 구독하여 세션 상태 동기화
 * 토큰 만료 전 자동 갱신 타이머 포함
 *
 * @example
 * ```tsx
 * function App() {
 *   useAuthStateSync();
 *   return <RouterProvider router={router} />;
 * }
 * ```
 */
export function useAuthStateSync() {
  const supabase = useAtomValue(supabaseAtom);
  const setSession = useSetAtom(sessionAtom);
  const initialized = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase || initialized.current) return;
    initialized.current = true;

    function clearRefreshTimer() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    }

    function scheduleRefresh(expiresAt: number | undefined) {
      clearRefreshTimer();
      if (!expiresAt) return;

      const now = Date.now();
      const expiresAtMs = expiresAt * 1000;
      const refreshAt = expiresAtMs - REFRESH_MARGIN_MS;
      const delay = refreshAt - now;

      if (delay <= 0) {
        // 이미 만료 임박 — 즉시 갱신
        supabase!.auth.refreshSession();
        return;
      }

      refreshTimerRef.current = setTimeout(() => {
        supabase!.auth.refreshSession();
      }, delay);
    }

    // 초기 세션 가져오기
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        identifyUser(session.user.id, { email: session.user.email });
        scheduleRefresh(session.expires_at);
      }
    });

    // 세션 변경 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        identifyUser(session.user.id, { email: session.user.email });
        scheduleRefresh(session.expires_at);
      } else {
        clearRefreshTimer();
        resetUser();
      }
    });

    return () => {
      clearRefreshTimer();
      subscription.unsubscribe();
    };
  }, [supabase, setSession]);
}
