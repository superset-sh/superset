/**
 * Auth Guard
 *
 * 인증된 사용자만 접근할 수 있는 가드 컴포넌트
 */
import type { ReactNode } from "react";
import { useEffect } from "react";

interface AuthGuardProps {
  children: ReactNode;
  /** 인증 상태 (null = 로딩 중) */
  authenticated: boolean | null;
  /** 미인증 시 호출할 콜백 */
  onUnauthenticated: () => void;
}

/**
 * 인증된 사용자만 접근할 수 있는 가드 컴포넌트
 *
 * @example
 * ```tsx
 * import { AuthGuard } from '@/core/auth';
 *
 * <AuthGuard
 *   authenticated={session !== null}
 *   onUnauthenticated={() => navigate('/sign-in')}
 * >
 *   <ProtectedContent />
 * </AuthGuard>
 * ```
 */
export function AuthGuard({ children, authenticated, onUnauthenticated }: AuthGuardProps) {
  useEffect(() => {
    if (authenticated === false) {
      onUnauthenticated();
    }
  }, [authenticated, onUnauthenticated]);

  return authenticated ? children : null;
}
