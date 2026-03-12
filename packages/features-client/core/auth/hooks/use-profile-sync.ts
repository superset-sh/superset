/**
 * Profile Sync Hook
 *
 * Better Auth 세션의 사용자 정보를 profileAtom에 동기화
 */
import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { authClient } from "@superbuilder/features-server/core/auth/client";
import { profileAtom, authenticatedAtom } from "../store";

/**
 * Better Auth 세션이 변경될 때 Profile 정보를 동기화
 * - 로그인 시: 세션의 user 정보 + organization member 역할로 Profile 구성
 * - 로그아웃 시: profile을 null로 설정
 *
 * @example
 * ```tsx
 * function App() {
 *   useAuthStateSync();
 *   useProfileSync();
 *   return <RouterProvider router={router} />;
 * }
 * ```
 */
export function useProfileSync() {
  const authenticated = useAtomValue(authenticatedAtom);
  const setProfile = useSetAtom(profileAtom);

  const { data: session } = authClient.useSession();
  const { data: activeOrg } = authClient.useActiveOrganization();

  useEffect(() => {
    if (!authenticated || !session?.user) {
      setProfile(null);
      return;
    }

    const user = session.user;

    // activeOrg에서 현재 사용자의 멤버 역할 추출
    const currentMember = activeOrg?.members?.find(
      (m: { userId: string }) => m.userId === user.id,
    );
    const memberRole = currentMember?.role as "owner" | "admin" | "member" | null ?? null;

    setProfile({
      id: user.id,
      name: user.name || "",
      email: user.email,
      avatar: user.image ?? null,
      authProvider: null,
      role: memberRole,
      createdAt: user.createdAt ? new Date(user.createdAt) : null,
      updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
    });
  }, [authenticated, session, activeOrg, setProfile]);
}
