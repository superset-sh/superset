/**
 * RoleBasedHome - Role에 따라 적절한 홈 화면으로 분기
 *
 * - 미로그인 → LandingPage
 * - 로그인 → UserHome
 */
import { authenticatedAtom } from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";
import { LandingPage } from "./landing";
import { UserHome } from "./user-home";

export function RoleBasedHome() {
  const authenticated = useAtomValue(authenticatedAtom);

  // 로딩 중
  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // 로그인 상태
  if (authenticated) {
    return <UserHome />;
  }

  // 미로그인
  return <LandingPage />;
}
