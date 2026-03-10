/**
 * Profile Sync Hook
 *
 * 세션 변경 시 profiles 테이블에서 사용자 정보 조회
 */
import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { profileAtom, sessionAtom, supabaseAtom } from "../store";

/**
 * 세션이 변경될 때 Profile 정보를 동기화
 * - 로그인 시: profiles 테이블에서 현재 사용자 정보 조회
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
  const supabase = useAtomValue(supabaseAtom);
  const session = useAtomValue(sessionAtom);
  const setProfile = useSetAtom(profileAtom);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;

    async function fetchProfile() {
      if (!session?.user?.id) {
        setProfile(null);
        return;
      }

      // 프로필과 역할을 병렬로 조회
      const [profileResult, roleResult] = await Promise.all([
        client
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single(),
        client
          .from("user_roles")
          .select("roles(slug)")
          .eq("user_id", session.user.id)
          .limit(1)
          .single(),
      ]);

      if (profileResult.error) {
        console.error("Failed to fetch profile:", profileResult.error);
        setProfile(null);
        return;
      }

      // user_roles에서 역할 slug 추출 (없으면 null)
      let roleSlug: string | null = null;
      if (!roleResult.error && roleResult.data) {
        const roles = (roleResult.data as unknown as { roles: { slug: string } | { slug: string }[] | null }).roles;
        if (Array.isArray(roles)) {
          roleSlug = roles[0]?.slug ?? null;
        } else {
          roleSlug = roles?.slug ?? null;
        }
      }

      const profile = profileResult.data;

      // auth_provider 동기화: session metadata의 provider 정보로 profiles 테이블 업데이트
      const sessionProvider = session.user.app_metadata?.provider as string | undefined;
      const validProviders = ["email", "google", "naver", "kakao"] as const;
      const resolvedProvider = validProviders.includes(sessionProvider as typeof validProviders[number])
        ? (sessionProvider as typeof validProviders[number])
        : null;

      if (resolvedProvider && profile.auth_provider !== resolvedProvider) {
        client
          .from("profiles")
          .update({ auth_provider: resolvedProvider })
          .eq("id", session.user.id)
          .then();
      }

      setProfile({ ...profile, role: roleSlug });
    }

    fetchProfile();
  }, [supabase, session?.user?.id, setProfile]);
}
