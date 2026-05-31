# Implementation Plan

## Preconditions

- Account-password scope is email-format account sign-in and sign-up only. No email verification, one-time codes, or password reset in this task.
- Before product-code edits, load `trellis-before-dev` for `desktop`, `auth`, and `trpc` as needed.
- Keep unrelated dirty worktree changes intact.

## Ordered Work

1. Enable production email/password auth.
   - Update `packages/auth/src/server.ts` `emailAndPassword.enabled`.
   - Keep account validation to email-format credentials and password.
   - Do not add password reset, email verification, or email-code flows.
   - Add focused tests or source checks if the auth package has existing coverage for auth config.

2. Build the desktop account/password entry flow.
   - Replace OAuth-only sign-in UI with email/password sign-in and sign-up states.
   - Persist returned token through `electronTrpc.auth.persistToken`.
   - Refetch session/JWT through existing `AuthProvider`/`authClient` flow.
   - Navigate successful auth to `/v2-workspaces`.
   - Keep OAuth as secondary if it remains working.

3. Remove old auth detours from the desktop happy path.
   - Preserve login blocking for missing/expired auth.
   - Remove or bypass `/create-organization` and onboarding redirects after successful account creation.
   - Keep error handling for the rare case where a session has no active organization.
   - Delete routes only after the route tree compiles or replace them with redirects.

4. Make V2 the only active workspace mode.
   - Change root and workspace redirects to V2 routes.
   - Simplify dashboard layout to always render the V2 sidebar and V2 new workspace modal.
   - Remove `useIsV2CloudEnabled` route branching from active navigation.
   - Redirect or delete V1 workspace routes after call sites are removed.

5. Remove Task paid gates.
   - Remove `gateFeature(GATED_FEATURES.TASKS, ...)` around Tasks navigation in both V1 and V2 sidebar headers, or remove the V1 caller if V1 is deleted first.
   - Remove `GATED_FEATURES.TASKS` and the Tasks paywall feature entry if no callers remain.
   - Keep task tRPC org/membership authorization intact.

6. Cleanup and generated files.
   - Regenerate route tree if route files are removed or renamed.
   - Delete unused V1 imports, stores, components, and tests only after TypeScript proves they are unreachable.
   - Keep migration code only if it has an explicit entry point.

## Validation

- Focused tests:
  - desktop sign-in/sign-up helper behavior
  - unauthenticated app access still redirects to the account flow
  - root `/` and `/workspace` redirect to V2
  - dashboard layout renders V2 sidebar without V1 mode switch
  - Tasks navigation opens `/tasks` without invoking paywall
  - cloud Task router cross-tenant tests still pass

- Commands:
  - `bun run --cwd apps/desktop generate:routes`
  - focused desktop tests for touched files
  - `bun test packages/trpc/src/router/task/task.test.ts`
  - `bun run lint:fix`
  - `bun run lint`
  - `bun run typecheck`

Adjust exact test paths to the final files touched.

## Search Gates

Before marking implementation done, run and inspect:

```bash
rg -n "useIsV2CloudEnabled|v2-local-override|V1ImportModal|WorkspaceSidebar|CrossVersionMismatchState" apps/desktop/src/renderer
rg -n "create-organization|onboarding" apps/desktop/src/renderer apps/desktop/src/main apps/desktop/src/lib
rg -n "emailAndPassword|sign-in/email|sign-up/email|reset-password|verify-email|emailVerification|sendResetPassword" packages/auth/src apps/desktop/src/renderer apps/web/src packages/email/src
rg -n "usePaywall|GATED_FEATURES|<Paywall|paywall\\(" apps/desktop/src/renderer
```

Remaining auth hits must be intentional account/password or OAuth-secondary code. Remaining V1/paywall hits must either be deleted, redirected compatibility code, or tests.

## Review Gates

- No production database access.
- No manual edits to generated Drizzle migrations.
- No removal of cloud membership authorization in `packages/trpc`.
- No weakening of host-service PSK checks.
- No hidden V1 links remain in active V2 desktop navigation.
