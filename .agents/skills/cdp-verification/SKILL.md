---
name: cdp-verification
description: Verify UI behavior end-to-end by driving the running desktop app over the Chrome DevTools Protocol. Use when asked to verify, reproduce, or confirm a UI change, bug, or regression in the real app rather than in tests.
---

# CDP UI Verification

"Rules" below is what counts as valid evidence. "Mechanics" is how to attach to the right renderer
and repair auth. `apps/desktop/scripts/cdp-smoke-integrations.ts` is a working example script.

## Rules

1. **Target the correct app instance.** Confirm and report the worktree, renderer URL/port, and
   active route before testing. Follow any task-provided CDP/auth guidance and verify the expected
   signed-in session. Another running desktop instance is not equivalent.

2. **Reproduce the exact user journey.** Use real browser input and visible UI navigation for the
   steps the user performs. Assigning DOM properties, invoking internal app APIs, or running
   component-only scripts is diagnostic support, not proof of end-to-end behavior.

3. **Capture visual and numeric evidence.** Take before/after screenshots paired with relevant CDP
   measurements (`scrollTop`, focused element, route, persisted state). Confirm the screenshot and
   the measured state agree.

4. **Exercise the relevant lifecycle.** Include the actual route change, workspace/pane/file switch,
   remount, or close/reopen from the report. A narrower synthetic flow cannot substitute for the
   reported interaction.

5. **Treat a mismatch as an incomplete reproduction.** If the test passes but the user still observes
   the bug, re-check the target instance, exact steps, input method, persisted keys, and lifecycle
   timing. Reproduce the failure before changing code; a synthetic smoke test does not disprove the
   report.

6. **Use an evidence gate.** For a reported bug or regression, do not claim verification until the
   original interaction demonstrably fails before the fix and passes after it under the same
   observations. For a new feature, record equivalent baseline evidence and demonstrate the expected
   behavior. State clearly which checks were end-to-end, which were synthetic, and whether
   screenshots were actually captured.

7. **Test in the real layout, not a staged one.** Do not rearrange the UI to make coordinates
   convenient (e.g. moving a target project next to the section under test) and then generalize from
   that pass. Layout-dependent failures live exactly in the configurations a staged setup removes:
   elements far apart, ambiguous zones between valid targets, scrolled containers, collapsed/empty
   states. Verify in the user's actual data shape; if a mutation was needed for setup, rerun the key
   journey in the unstaged arrangement too.

   Case study: sidebar drag-and-drop passed every staged test, then crashed with "Maximum update
   depth exceeded" in the real layout because closest-target collision oscillated across the large
   gap between the Pinned section and a bottom-of-list project.

8. **Drive interactions adversarially, not just happy-path.** A scripted A-to-B gesture proves the
   feature works once, not that it is stable. For anything continuous (drag-and-drop, resize,
   scroll-linked UI), also test: back-and-forth oscillation across boundaries, mid-gesture dwells
   (hold still 0.5-1s where layout can shift under a stationary pointer), long sweeps that trigger
   autoscroll, repeats of the same gesture, and runs with induced main-thread stalls
   (`setInterval` busy-loop, e.g. 120ms every 400ms) to force event batching. Watch for feedback
   loops where the interaction's own state change re-triggers its trigger (transfer → layout shift →
   re-measure → transfer). Capture `console.error` (hook it and assert empty afterward): "Maximum
   update depth exceeded" and "Cannot update a component while rendering" are regressions even when
   the screenshot looks fine.

## Mechanics

These apply to the Electron desktop app in `apps/desktop`.

To check a change end-to-end against the real API/DB, drive the running dev app over CDP. Launch with an unused port, for example `RENDERER_REMOTE_DEBUG_PORT=9222 bun dev` (full stack; the app may restore a signed-in session), then attach via the page target's `webSocketDebuggerUrl` over a WebSocket (Bun built-in, no deps). Example: `apps/desktop/scripts/cdp-smoke-integrations.ts`.

**Never assume port 9222 or attach to a renderer from another worktree.** Multiple Superset workspaces commonly run at once, each with different renderer, API, and CDP ports. Before testing:

1. Read this workspace's final `DESKTOP_VITE_PORT` and `NEXT_PUBLIC_API_URL` values from the root `.env`.
2. Find the Electron process whose executable/parent command path is inside this workspace. Its renderer command line contains `--remote-debugging-port=<port>`; `lsof -nP -iTCP -sTCP:LISTEN` can confirm the owning PID.
3. Fetch `http://127.0.0.1:<port>/json/list` and require a `page` target whose URL uses this workspace's `DESKTOP_VITE_PORT`. A responding CDP endpoint alone is not sufficient proof that it belongs to this branch.
4. Pass the matched values explicitly when using a script, e.g. `RENDERER_REMOTE_DEBUG_PORT=<port> NEXT_PUBLIC_API_URL=<api-origin> bun run apps/desktop/scripts/cdp-smoke-integrations.ts`.

Verify `/api/auth/get-session` from inside the matched renderer before testing.

### Repairing CDP auth

Check which setup script provisioned the workspace before repairing auth:

- `.superset/setup.local.sh` creates a per-workspace local stack and runs the idempotent `bun run db:seed-dev`, but intentionally leaves sign-in as a separate step. If the account may be missing, rerun `bun run db:seed-dev` while the local DB stack is running.
- `.superset/setup.sh` seeds `superset-dev-data/auth-token.enc` from `$HOME/.superset/auth-token.enc` when available. Rerunning it without `--force` can fill a missing token. Do not use `--force` merely to repair auth: it resets `superset-dev-data/` before reseeding.

The desktop hydrates a persisted token into an in-memory bearer-token closure. A raw `Runtime.evaluate` `fetch` cannot read that closure, and the local-dev sign-in button persists a bearer token but uses `credentials: "omit"`; neither guarantees the cookie required by a raw CDP probe. For a workspace created by `setup.local.sh`, repair the CDP session as follows:

1. Require a localhost API origin; never send dev credentials to a remote or shared API.
2. From `apps/desktop` (so workspace imports resolve), import `DEV_EMAIL` and `DEV_PASSWORD` from `@superset/shared/dev-credentials`; do not copy their literal values into scripts or logs.
3. Through `Runtime.evaluate` in the matched renderer, POST them to `${NEXT_PUBLIC_API_URL}/api/auth/sign-in/email` with JSON content type and `credentials: "include"`. Do not print the returned token or response body.
4. Re-fetch `/api/auth/get-session` with `credentials: "include"` and require both `session` and `session.activeOrganizationId` before running the test.

This credentialed local-dev sign-in creates the browser session cookie needed by subsequent in-renderer fetches. If it fails, report the sign-in/session status codes only. For a non-local setup, use the app's normal sign-in flow; never substitute local dev credentials.

For a non-local workspace, the normal desktop flow intentionally restores an encrypted bearer token into the renderer's in-memory auth client without creating a browser cookie. If the renderer is on an authenticated route but a raw cookie-only probe returns no session, use `Runtime.evaluate` to import `/lib/auth-client.ts` from the renderer dev server and call `authClient.getSession({ fetchOptions: { throw: false } })`. This still verifies `/api/auth/get-session` through the app's real authenticated request path. Return only the status and `session.activeOrganizationId`; never call or print `getAuthToken()`.

Do not use setup `--force` to fix a stale connection string, a missing CDP cookie, or a corrupt generated Next.js cache. First rerun the applicable setup script without force. If every API route returns Next.js's HTML 404, stop the dev stack, move `apps/api/.next` aside, and restart. `--force` is normally only appropriate when the user explicitly intends to replace the copied local/host databases and encrypted auth token. The stale-state signature in the next paragraph is the one explicit exception.

One failure signature where `./.superset/setup.sh --force` IS the fix (verified 2026-07-28): session restore hangs at "Restoring your session", the Local Admin sign-in button returns a bodyless 500, get-session returns 200, and a raw `select 1` against `DATABASE_URL` may still succeed; the worktree's seeded dev state (Neon branch credentials in `.env`, `auth-token.enc`, copied DBs) has gone stale as a set. Rerunning with `--force` recreates the Neon branch, rewrites `.env`, and reseeds `superset-dev-data/` together, which restores sign-in. Two side effects to expect: any manual `.env` edits (e.g. a port remap) are wiped and must be re-applied, and `superset-dev-data/` is reset.

**Use `Runtime.evaluate` (`awaitPromise`, `returnByValue`), not `Network.*` interception**; sniffing misses React-Query-cached responses, and `refetchInterval` is paused while the window is backgrounded. After verifying the session through the applicable cookie or bearer path above, run requests inside the renderer. `API` below is the dev backend origin (`NEXT_PUBLIC_API_URL`, e.g. `http://localhost:5881`):

- Active org: local cookie flow uses `fetch(API + "/api/auth/get-session", {credentials:"include"})`; non-local bearer flow uses `authClient.getSession({ fetchOptions: { throw: false } })`. Require `.session.activeOrganizationId`.
- A tRPC query (bypasses the cache): GET `API + "/api/trpc/<proc>?batch=1&input=" + encodeURIComponent(JSON.stringify({"0":{json:<input>}}))`; response is `[{result:{data:{json:...}}}]`.
- `window.location.hash` nav may not remount the route; call the endpoint directly instead.
