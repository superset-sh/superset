/**
 * Auth State Sync Hook
 *
 * Better Auth 세션 상태를 감지하여 sessionAtom을 동기화
 */
import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { authClient } from "@superbuilder/features-server/core/auth/client";
import { identifyUser, resetUser } from "../../analytics/posthog-provider";
import { sessionAtom, authenticatedAtom, tokenAtom } from "../store";

/**
 * Better Auth useSession()을 구독하여 세션 상태 동기화
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
  const setSession = useSetAtom(sessionAtom);
  const setAuthenticated = useSetAtom(authenticatedAtom);
  const setToken = useSetAtom(tokenAtom);

  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;

    if (session?.user) {
      setSession({ token: session.session.token, user: session.user });
      setToken(session.session.token);
      setAuthenticated(true);
      identifyUser(session.user.id, { email: session.user.email });
    } else {
      setSession(null);
      setToken(null);
      setAuthenticated(false);
      resetUser();
    }
  }, [session, isPending, setSession, setAuthenticated, setToken]);
}
