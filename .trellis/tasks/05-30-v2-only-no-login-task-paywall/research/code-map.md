# Code Map

## Auth And Login

- `packages/auth/src/server.ts` has `emailAndPassword.enabled`, currently limited to development.
- Password reset and email verification are intentionally out of scope for this task after scope reduction; do not add account email templates.
- `apps/desktop/src/renderer/routes/sign-in/page.tsx` is the production OAuth/dev sign-in UI.
- Desktop dev sign-in already calls `/api/auth/sign-in/email` and `/api/auth/sign-up/email`.
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` has a dev-only email/password helper.
- `apps/web/src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` is social-provider focused.
- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` is the blocking auth shell.
- `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` hydrates stored tokens and blocks render until hydration finishes.
- `apps/desktop/src/renderer/routes/create-organization/page.tsx` owns organization creation.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/*` owns post-login onboarding.
- `apps/desktop/src/main/index.ts` handles `superset://auth/callback` deep links via `parseAuthDeepLink` and `handleAuthCallback`.
- `apps/desktop/src/lib/trpc/routers/auth/index.ts` persists tokens, starts OAuth sign-in, and signs out by stopping host-service.

## V1/V2 Split

- `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts` is the primary V2 switch.
- `apps/desktop/src/renderer/routes/page.tsx` still redirects to `/workspace`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx` branches between V1 and V2 sidebar/layout behavior.
- V1 route files live under:
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace`
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspaces`
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/project`
- V2 route files live under:
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces`
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace`
- V1 migration modal lives under `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal`.

## Paywall And Task Limits

- `apps/desktop/src/renderer/components/Paywall` contains the desktop paywall modal and `usePaywall`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx` gates V2 Task navigation.
- `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx` gates V1 Task navigation.
- `packages/trpc/src/router/task/task.ts` requires auth/org membership but has no paid-plan check.
- `packages/trpc/src/router/host/host.ts` returns `paidPlan` for host relay access checks; this is remote-host gating, not direct Task gating.

## V2 Data And Runtime Dependencies

- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts` creates Electric-backed per-org collections and uses auth JWT headers.
- `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx` requires an active organization id before rendering children.
- `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx` starts host-service per organization and exposes the local PSK-backed host URL.
- `apps/desktop/src/lib/trpc/routers/host-service-coordinator/index.ts` requires a stored auth token for `start`, `restart`, and `reset`, which is still acceptable because accounts remain required.
- `apps/desktop/src/main/host-service/index.ts` uses `JwtApiAuthProvider` for cloud API access and `PskHostAuthProvider` for local host-service access.
