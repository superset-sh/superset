# Make desktop V2-only with password auth and no task paywall

## Goal

Make the desktop app V2-only, keep the foreground login blocker, replace the current OAuth-only login with a real email/password account flow, and remove paid-plan restrictions on Tasks. This is not an anonymous/no-account desktop mode; the account system stays because multi-machine collaboration needs user and organization identity.

## User Value

- Users can create and use a Superset account with email/password instead of being forced through GitHub/Google OAuth.
- Unauthenticated users remain blocked from the app until they sign in or sign up.
- The first workspace product surface after authentication is V2.
- Tasks and PRs remain available from desktop navigation regardless of subscription plan.
- V1 workspace UI and old V2 opt-in paths stop adding product and code complexity.

## Confirmed Facts

- The desktop login gate is in `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`; it redirects unauthenticated users to `/sign-in`, redirects missing active organizations to `/create-organization`, gates onboarding on `session.user.onboardedAt`, mounts `CollectionsProvider`, `LocalHostServiceProvider`, and the global `Paywall`.
- `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` blocks all routes until it hydrates an encrypted auth token from `apps/desktop/src/lib/trpc/routers/auth/utils/auth-functions.ts`.
- `packages/auth/src/server.ts` already configures Better Auth `emailAndPassword`, but it is enabled only when `NODE_ENV === "development"`.
- `apps/desktop/src/renderer/routes/sign-in/page.tsx` is OAuth-first in production. It only uses `/api/auth/sign-in/email` and `/api/auth/sign-up/email` in the dev-only "Sign in as Local Admin" flow.
- `apps/web/src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` has a dev-only email/password helper. Web sign-up remains social-provider focused.
- Better Auth `databaseHooks.user.create` already auto-enrolls by allowed domain or creates a personal organization and then updates the session active organization.
- V1 vs V2 selection is driven by `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts` and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx`.
- V1 surfaces still include `/workspace`, `/workspaces`, V1 `WorkspaceSidebar`, V1 `WorkspaceLayout`, `NewWorkspaceModal`, and `V1ImportModal`.
- V2 renderer data uses organization-scoped Electric/TanStack collections in `apps/desktop/src/renderer/routes/_authenticated/providers/CollectionsProvider/collections.ts`.
- Task tRPC procedures in `packages/trpc/src/router/task/task.ts` are membership-scoped but not subscription-scoped.
- Task paid gating found so far is client-side paywall navigation in desktop sidebars: `DashboardSidebarHeader` and V1 `WorkspaceSidebarHeader`.

## Requirements

- Keep an account system. Do not implement anonymous local-first mode in this task.
- Keep the login blocker. Missing/expired auth must still redirect to the account entry flow.
- Enable production email/password sign-in and sign-up using the existing Better Auth stack.
- Treat the account identifier as an email-format string, but do not require email verification, email codes, or password reset in this task.
- Replace the current OAuth-only desktop entry page with a first-class email/password account flow. OAuth may remain as secondary options.
- A successful email/password sign-up must create or attach an organization and land in V2 without a separate create-organization/onboarding detour.
- V2 must be the only primary workspace mode. Desktop entry redirects and navigation should target `/v2-workspaces` and `/v2-workspace/$workspaceId`.
- V1 workspace UI must be removed from primary navigation and route decisions. Remaining V1 code should either be deleted in the same change or isolated behind an explicit migration/compatibility boundary.
- Tasks and PRs navigation must open directly for free users; no Task entry point should call `gateFeature(GATED_FEATURES.TASKS, ...)`.
- Removing the paid Task limit must not remove tenant access checks from cloud Task APIs.
- Local host-service PSK authentication must remain in place for renderer-to-host tRPC, event, terminal, and remote-control routes.
- Existing TanStack DB cache-first rendering behavior must be preserved when touching V2 collections.

## Acceptance Criteria

- Fresh desktop launch without `auth-token.enc` reaches the new email/password entry flow, not the current OAuth-only page.
- Fresh desktop launch without `auth-token.enc` cannot access the V2 app shell before authentication.
- A user can sign up with an email-format account and password, persist the desktop token, hydrate the session, and land on `/v2-workspaces`.
- A user can sign in with email/password and land on `/v2-workspaces`.
- Root desktop navigation (`/`) lands in the V2 workspace list after authentication.
- Task navigation opens `/tasks` without opening the paywall for users whose current plan resolves to `free`.
- Direct Task routes (`/tasks`, `/tasks/$taskId`, `/tasks/pr/$prNumber`, `/tasks/issue/$issueNumber`) remain reachable through V2 desktop navigation.
- V1 workspace routes are not linked from active desktop navigation. If kept temporarily, they redirect to V2 or are documented as migration-only.
- The Task tRPC router still rejects cross-tenant access.
- Existing billing settings do not break for signed-in users.
- Focused tests cover password auth entry behavior where practical, V2-only route selection, and Task paywall removal.
- `bun run lint` and `bun run typecheck` pass before implementation is marked complete.

## Out Of Scope

- Anonymous local-first desktop mode or bypassing login for normal users.
- Email verification, one-time email codes, and password reset/recovery flows.
- Production database migrations unless a later design decision requires auth schema changes.
- Zano or Multica migration, Supabase compatibility, and long-term A2A data-model unification.
- Removing Stripe billing, subscription management, invoice access, or paid gates unrelated to Tasks.
- Removing organization membership authorization from cloud APIs.
- Full Chat/Code/Work product shell split; that remains a follow-up task after this cleanup.
