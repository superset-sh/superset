# Desktop auth: audit and path to Better Auth's Electron plugin

Status: audit done 2026-09-18. Three fixes ship with this doc. The migration is a proposal, not
started.

## Why this exists

On 2026-09-18 a Pro user was signed out mid-session, signed back in with the wrong provider, got a
new empty account, and then saw an empty sidebar on his real account. Two separate bugs, both in
code we wrote by hand around Better Auth.

## The rule we broke

The server decides when a session ends. A client may keep an expiry as a hint (refresh early), but
it only treats the session as over when the server says so: a 401, or a session read that returns
nothing. A slow or offline read is not a sign-out (#5729 already covers that half).

## What we have today

| Piece | Where | Note |
| --- | --- | --- |
| Sign-in handoff | `apps/web/src/app/auth/desktop/success/page.tsx:130-152` | Inserts a `sessions` row by hand, then puts the 30-day session token in `superset://auth/callback?token=…` and, on Linux, a `http://127.0.0.1` URL |
| State check | `apps/desktop/src/lib/trpc/routers/auth/index.ts:87-122`, `utils/auth-functions.ts:204,335-359` | 32-byte state in an in-memory map. Lost on restart. No age check when it is consumed |
| Token file | `utils/auth-functions.ts`, `utils/crypto-storage.ts` | `~/.superset/auth-token.enc`, AES-256-GCM, key = scrypt(machine id). Any process running as the user can derive the key |
| Renderer client | `apps/desktop/src/renderer/lib/auth-client.ts` | Holds the session token, sends it as `Authorization: Bearer`, mints JWTs for host-service and relay. No 401 handler |
| Boot | `apps/desktop/src/renderer/providers/AuthProvider/AuthProvider.tsx` | Reads the file over IPC, sets the token, refetches the session |
| Host-service child | `apps/desktop/src/main/host-service/index.ts:92-102` | Separate Node process. Re-reads and decrypts the token file on every JWT mint |
| CLI and standalone host-service | `packages/cli/src/lib/auth.ts`, `packages/host-service/src/serve.ts:63-77` | Separate credential: OAuth code + PKCE into `~/.superset/config.json`. Never touches the token file |
| Mobile | `apps/mobile/lib/auth/client.ts` | `@better-auth/expo` + SecureStore. No stored expiry, no local expiry check |

## Findings

### Fixed on this branch

- **F1. Forced sign-out 30 days after sign-in.** The stored `expiresAt` is written once at sign-in.
   The server extends the session daily (`packages/auth/src/server.ts:165-166`), nothing rewrites
   the stored value, and `AuthProvider` dropped the token when that date passed without asking the
   server. Every desktop user hit `/sign-in` on the first renderer load after day 30. Fix:
   `resolveStoredToken` ignores the stored date; the session read decides.
- **F2. The window trusts the previous account's cached data.** Sign-out never cleared the shared
   query cache, and `CollectionsProvider`'s run-once init read two stale values on the next
   sign-in: the previous account's `organization.list`, and a `window.getActiveOrg` that is always
   one mount behind the registry. One hop to another account and back passes by luck. Sign into
   account B twice (B, out, B, out), then into A, and both stale values name B's organization: the
   window pins to it, A sees B's empty sidebar, and only a restart clears it. Two layers now:
   - `resolveInitialWindowOrganization` only accepts values that landed after the provider
     mounted, and both reads refetch on mount. This alone fixes the sequence, with the cache left
     dirty on purpose.
   - `AuthProvider` clears the query cache when the token is removed. Every window hears that
     event, so a sign-out in one window cleans all of them. After it, only machine-local settings
     keep data, and the on-disk cache is empty.
- **F3. Blank window when the organization list fails at mount.** The read now retries five times
  with backoff (1 to 16 s, capped per #5518), so a window that mounted during a short API outage
  fills in by itself; before, it stayed blank until it regained focus. When the retries run out
  the window shows an error with a Retry button instead of nothing.

Both were reproduced in the dev app over CDP on 2026-09-18, before and after the fix:

| Scenario | `main` | With the fix |
| --- | --- | --- |
| Stored expiry in the past, server session valid (200), reload | `/sign-in` | Stays signed in |
| B, out, B, out, A in one window, no reload | Signed in as A, window on B's organization, sidebar empty | Window on A's organization, sidebar full |

### Found while testing the fixes (open)

- **Signing out while the API is unreachable leaves a tokenless app shell.** The token is removed
  and the cache cleared, but the session state in memory keeps its last user, so the window never
  reaches `/sign-in`, even after the network returns. Same on `main`. Fixing it means resetting the
  auth client's session state by hand.
- **Five minutes of blank after a session is revoked elsewhere.** The server's session cookie
  cache (`cookieCache`, 5 min) keeps answering "signed in" while the API rejects the token, so the
  organization list fails and the window is blank. Same on `main`.
- **A dead token still reads "Restoring your session".** With the expiry check gone, a user whose
  session really expired reaches `/sign-in` in about 1.4 s as before, but under the restoring
  subtitle, and recovery polling runs its 12 capped attempts against a token that will never work.
  The token should be dropped once the server answers with no session.

### Found while faking network conditions

- **API unreachable, machine online, reload:** `/sign-in` within 2 s with every provider button
  live and a small "Restoring your session" line. It recovers by itself about 15 to 20 s after the
  API returns, but a click on the wrong provider in that window signs into another account. This
  is a second way to reach the sign-in page with a valid session, independent of F1. The
  buttons should be held back while a stored token is still being restored.
- **Auth reachable, `/api/trpc` failing, reload:** a fully blank window that only recovered on a
  window focus event. Fixed above (F3): it now recovers within 20 s of the API returning.
- **Slow link (4 s latency) at sign-in:** about 15 s blank, a few seconds of empty Projects, then a
  full sidebar. Slow, not stuck.

### Open, security

3. The long-lived session token travels in URLs. The loopback URL lands in browser history.
4. The session row is inserted directly, so Better Auth's session hooks never run for desktop
   sessions.
5. The token file's key is the machine id. It stops a copied file from working on another machine
   and nothing else.
6. A page in an in-app browser pane can reach the auth deep-link handler
   (`browser-manager.ts:947,991,1020` → `main/index.ts:173-175`). Only the state value stops it.
7. Sign-out revokes the server session best effort with a 5 s timeout and no retry
   (`useSignOut.ts`). CLI logout never revokes.

### Open, correctness

8. `token-saved` stops every host-service and nothing in the main process restarts them. Restart
   depends on the renderer persisting the new membership (`LocalHostServiceProvider.tsx:111-130`).
9. `saveToken` drops the cached membership, so tray and UI restarts are rejected until the renderer
   writes it back (`organization-membership.ts:11-24`).
10. `CollectionsProvider` init runs once per mount. A token swap without a sign-out (deep link
    while signed in) keeps the old organization. The init should also re-run when the user id
    changes and should only trust an organization list fetched after mount.
11. The state map has no age check at consumption and does not survive a restart, so a cold-start
    auth deep link always fails.
12. No test covers `AuthProvider` hydration, `useSignOut`, or the loopback callback route.

### Open, product

13. The sign-in page has carried a "Last used" badge since 1.13.0 (#5432, a localStorage key) and
    the person still picked the other provider, which creates a second account when the emails
    differ. Their suggestion is the stronger hint: remember the last account's name and avatar
    locally and show "Continue as …" on the sign-in page.

## What Better Auth ships

`@better-auth/electron` (1.6.22 matches our `better-auth` 1.6.22; needs Electron ≥ 36, we run 41).
Read from the docs and the published build:

- The browser gets a 32-character code that lives 5 minutes. The app exchanges it at
  `POST /electron/token` with a PKCE S256 verifier and the state. The session token never appears
  in a URL.
- The exchange calls `createSession`, so the desktop still gets its own session and its own active
  organization, and session hooks run.
- The client lives in the main process. The renderer gets IPC bridges (`requestAuth`, `signOut`,
  `onAuthenticated`, `onUserUpdated`, `onAuthError`) and never holds the token.
- Cookies are stored through a pluggable `storage`, encrypted with Electron `safeStorage`. The
  stored expiry is rewritten from `Set-Cookie` on every response, so it follows the server.
- A manual code-paste fallback covers desktops where deep links fail. That replaces our
  Linux-only loopback callback.

## Where it does not fit as-is

| Gap | Why it matters | Way through |
| --- | --- | --- |
| Renderer holds the token today | tRPC, Electric, JWT minting and relay all authenticate from the renderer | Either move those calls behind IPC (large), or keep a renderer bearer and use the plugin only for the handoff and storage. Decide first |
| `safeStorage` only works inside Electron | The host-service child decrypts the token file itself | Pass the child a short-lived JWT or the token over its env/IPC at spawn and on change; stop reading the file from the child |
| Existing installs | A migration must not sign everyone out | On first boot, read `auth-token.enc`, seed the plugin's cookie store, then delete the file |
| Dev setup | `.superset/lib/setup/steps.sh:455-482` copies the token file into worktrees | Needs a new seeding path once storage is keychain-backed |
| Multi-account plan | `apps/desktop/plans/20260318-1400-ux-polish-linear-style.md:230-300` wants several stored accounts | Check the plugin plus `multiSession` covers it before building on it |

## Proposed order

1. Ship F1 to F3.
2. Fix the three bugs found while testing, re-run the window's organization check when the user
   changes without a sign-out (finding 10), and restart host-services from the main process after
   a token change (findings 8, 9).
3. Show the remembered account on the sign-in page, and hold the provider buttons back while a
   stored token is being restored (finding 13 and the network findings).
4. Replace the handoff with the plugin's code + PKCE exchange, keeping the renderer bearer for now
   (findings 3, 4, 6, 11). This removes the token from URLs without the large renderer change, and
   a callback injected from a browser pane cannot complete without this app's code verifier.
5. Decide whether to move the token out of the renderer and into `safeStorage` (finding 5),
   which needs the host-service change above.
