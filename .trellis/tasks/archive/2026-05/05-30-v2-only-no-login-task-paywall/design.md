# Design: V2-only desktop with password auth and no Task paywall

## Architecture Boundaries

This work crosses four boundaries:

- Desktop renderer auth and routing: `apps/desktop/src/renderer/routes`, `renderer/providers`, `renderer/hooks`.
- Desktop main/IPC auth token persistence: `apps/desktop/src/lib/trpc/routers/auth`.
- Cloud auth: `packages/auth`.
- Task/billing checks: `packages/trpc`, desktop Paywall components.

The clean split is: account auth remains mandatory, the foreground login blocker stays, but the auth product becomes email/password-first instead of OAuth-only. V2 becomes unconditional after authentication.

## Proposed Shape

### 1. Password auth

Use the existing Better Auth `emailAndPassword` feature rather than adding another auth system.

- In `packages/auth/src/server.ts`, enable `emailAndPassword` outside development.
- Keep the account identifier as an email-format string.
- Do not configure email verification, one-time email codes, or password reset in this task.
- Keep `autoSignIn: true` if Better Auth returns a usable token/session for desktop sign-up.
- Reuse the existing user creation hook that creates/joins an organization and sets `activeOrganizationId`.
- Ensure desktop token persistence still goes through `electronTrpc.auth.persistToken`.

### 2. Desktop entry page

Replace the current OAuth-only `/sign-in` page with an account form:

- Sign in tab: email + password.
- Sign up tab: name + email + password.
- OAuth buttons can stay below the form as secondary options.
- On success, persist the returned token, refetch session/JWT, and navigate to `/v2-workspaces`.
- Remove dev-only email/password special casing once the same flow works generally.

If Better Auth's email sign-in response shape differs between browser session cookies and bearer tokens, add a small typed helper around the existing REST endpoint or Better Auth client call rather than duplicating fetch logic across web and desktop.

`_authenticated/layout.tsx` should remain an auth guard. The change is not to bypass it; the change is that unauthenticated users land on a better account page, and authenticated users always enter V2.

### 3. Create organization and onboarding

Desktop should not send successful sign-ups through separate create-organization or onboarding screens by default. The server hook already creates or joins an organization. The authenticated desktop shell should rely on the hydrated session's `activeOrganizationId`.

If `activeOrganizationId` is missing after email/password sign-up, keep blocking app access and show a targeted auth/account error. Treat it as an auth/session bug to handle close to account creation, not a reason to keep the old route detour.

### 4. V2-only routing

Make V2 the default desktop mode by removing `useIsV2CloudEnabled` as a product switch. Then update route redirects and dashboard branching:

- `/` -> `/v2-workspaces` after auth.
- `/workspace` -> `/v2-workspaces`.
- `/workspace/$workspaceId` -> either redirect to a matching V2 route when a mapping exists or to `/v2-workspaces`.
- Dashboard layout always renders `DashboardSidebar`.
- Remove `CrossVersionMismatchState` from normal flow.
- Remove V1 sidebar/modal imports from the dashboard shell.

After this is stable, delete unused V1 route/component trees or leave only bounded migration redirects.

### 5. Task paywall removal

Tasks are not subscription-gated in `packages/trpc/src/router/task/task.ts`. Remove client-side Task paywall calls from:

- `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`

If no callers remain, remove `GATED_FEATURES.TASKS` and the Tasks paywall copy from desktop Paywall constants. If no production callers remain at all after V2 cleanup, delete the desktop Paywall tree.

### 6. Billing and membership limits

Organization member limits are not Task limits. Keep them unless product scope explicitly expands to all team/member paid limits.

Relevant code:

- `packages/auth/src/server.ts` `beforeAddMember`, `afterAddMember`, `afterRemoveMember`
- `packages/auth/src/lib/accept-invitation-endpoint.ts`
- desktop invite UI in `apps/desktop/src/renderer/routes/_authenticated/settings/members/...`

## Compatibility Notes

- Existing OAuth users should continue to sign in.
- Existing signed-in users should continue to see their cloud organizations, billing settings, remote hosts, and synced V2 workspaces.
- Host-service local PSK must remain the renderer-to-host-service security boundary.
- If V1 routes are deleted, update generated TanStack route tree through the repo's normal route generation/build flow rather than hand-editing generated output.

## Risks

- Better Auth email/password is currently development-only, so production behavior and token response shape need focused verification.
- Removing create-organization/onboarding detours may expose cases where session active organization is not populated immediately after sign-up.
- Removing V1 imports from dashboard layout can reveal hidden compile-time dependencies in settings, command palette, and migration code.
- Task paywall removal is small, but deleting shared paywall constants may affect analytics or billing copy if not searched carefully.
