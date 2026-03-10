/**
 * Admin Guard
 *
 * Admin 권한이 있는 사용자만 접근할 수 있는 가드 컴포넌트
 */
import type { ReactNode } from "react";
import { useEffect } from "react";

export type AdminRole = "owner" | "admin";

interface AdminGuardProps {
  children: ReactNode;
  /** 로그인 여부 (null = 로딩 중) */
  authenticated: boolean | null;
  /** 사용자 역할 (null = 로딩 중 또는 미로그인) */
  userRole: string | null;
  /** 미로그인 시 호출 */
  onUnauthenticated: () => void;
  /** 권한 없음 시 호출 */
  onUnauthorized: () => void;
  /** 허용할 역할 (기본: owner, admin) */
  allowedRoles?: AdminRole[];
}

/**
 * Admin 권한이 있는 사용자만 접근할 수 있는 가드 컴포넌트
 *
 * @example
 * ```tsx
 * import { AdminGuard } from '@/core/auth';
 *
 * <AdminGuard
 *   authenticated={session !== null}
 *   userRole={profile?.role}
 *   onUnauthenticated={() => navigate('/admin/login')}
 *   onUnauthorized={() => navigate('/unauthorized')}
 * >
 *   <AdminContent />
 * </AdminGuard>
 * ```
 */
export function AdminGuard({
  children,
  authenticated,
  userRole,
  onUnauthenticated,
  onUnauthorized,
  allowedRoles = ["owner", "admin"],
}: AdminGuardProps) {
  // 로딩 완료 여부: authenticated가 결정되고, 로그인 상태라면 userRole도 결정되어야 함
  const isLoading = authenticated === null || (authenticated === true && userRole === null);

  useEffect(() => {
    // 로딩 중이면 아무것도 안함
    if (isLoading) return;

    // 미로그인
    if (authenticated === false) {
      onUnauthenticated();
      return;
    }

    // 로그인했지만 권한이 없음
    if (!allowedRoles.includes(userRole as AdminRole)) {
      onUnauthorized();
    }
  }, [isLoading, authenticated, userRole, allowedRoles, onUnauthenticated, onUnauthorized]);

  // 로딩 중
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // 미로그인
  if (authenticated === false) {
    return null;
  }

  // 권한 체크
  if (!allowedRoles.includes(userRole as AdminRole)) {
    return null;
  }

  return <>{children}</>;
}
