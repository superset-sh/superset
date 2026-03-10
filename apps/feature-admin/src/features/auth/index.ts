// Config
export { authConfig, type AuthUiVariant } from "./config";

// Routes (code-based routing)
export {
  createAuthRoutes,
  createAuthAdminRoutes,
  createSignInRoute,
  createSignUpRoute,
  createAdminLoginRoute,
} from "./routes";

// Hooks (Feature-specific hooks)
export {
  useSupabaseAuthAction,
  useSignInWithEmailAndPassword,
  useSignUpWithEmailAndPassword,
  useSignInWithOAuth,
  useAdminSignIn,
} from "./hooks";

// UI - Public
export {
  SignInForm,
  SignUpForm,
  ForgotPasswordForm,
  ResetPasswordForm,
  AdminSignInForm,
} from "./pages";

// Re-export from @superbuilder/features-client/core/auth for convenience
// (prefer using @superbuilder/features-client/core/auth directly)
export {
  // Hooks
  useAuthStateSync,
  useProfileSync,
  // Guards
  AuthGuard,
  AdminGuard,
  type AdminRole,
  // Store
  supabaseAtom,
  sessionAtom,
  profileAtom,
  authenticatedAtom,
  userRoleAtom,
} from "@superbuilder/features-client/core/auth";
