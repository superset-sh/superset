/**
 * @/core/auth
 *
 * 인증 관련 핵심 모듈
 * - 모든 Feature와 App에서 참조 가능
 * - 순환 의존성 방지를 위해 features가 아닌 core에 위치
 */

// Store (Jotai Atoms)
export {
  // Atoms
  supabaseAtom,
  tokenAtom,
  authenticatedAtom,
  sessionAtom,
  currentSessionAtom,
  getSupabaseAtom,
  profileAtom,
  userRoleAtom,
  // Constants
  TOKEN_STORAGE_KEY,
  // Types
  type Profile,
} from "./store";

// Hooks
export { useAuthStateSync } from "./hooks/use-auth-state-sync";
export { useProfileSync } from "./hooks/use-profile-sync";

// Session Refresh
export {
  setSupabaseForRefresh,
  refreshSessionToken,
  isUnauthorizedError,
} from "./session-refresh";

// Guards
export { AuthGuard } from "./guards/auth-guard";
export { AdminGuard, type AdminRole } from "./guards/admin-guard";

// Note: Schema exports (users, profiles, roles) are now centrally managed
// Import directly from @superbuilder/drizzle instead
