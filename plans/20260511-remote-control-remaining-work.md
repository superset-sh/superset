# Remote Control Remaining Work Plan

## Context

PR #4345 adds browser-based remote control for v2 desktop terminals. The current branch has addressed most review comments: anonymous viewers can resolve sessions, the share-page token moved to a URL fragment, `get` is a mutation, revoked/expired sessions no longer return a WebSocket URL, relay mint/revoke calls are bounded, and orphan host-session cleanup is attempted on cloud insert failure.

The remaining merge concern is that the bearer token is still placed on the WebSocket upgrade URL. That token grants terminal control, so relying on relay logger redaction is not enough for a production rollout.

## Merge Blocker

### 1. Move WebSocket bearer auth out of the URL

Current behavior:

- `apps/web/src/app/(public)/agents/remote-control/[sessionId]/components/RemoteTerminal/RemoteTerminal.tsx` opens the socket as `meta.wsUrl?remoteControlToken=...`.
- `packages/host-service/src/terminal/remote-control/route.ts` reads the token from `c.req.query(REMOTE_CONTROL_TOKEN_PARAM)`.
- `apps/relay/src/index.ts` redacts `remoteControlToken` in Hono logs, but the token can still appear in infrastructure access logs, replay/debug logs, browser tooling, or any logging path that records request URLs before app-level redaction.

Target behavior:

- The public share URL keeps the token in the fragment.
- `remoteControl.get` keeps accepting the token in a tRPC mutation body.
- The WebSocket URL contains no bearer token.
- The viewer authenticates by sending a first WebSocket message over `wss`.

Implementation outline:

1. Extend `packages/shared/src/remote-control-protocol.ts` with an auth client message:
   - Add `RemoteControlAuthMessage`.
   - Add `{ type: "auth"; token: string }` to `RemoteControlClientMessage`.
   - Keep `REMOTE_CONTROL_TOKEN_PARAM` only for the page fragment unless it is still used elsewhere.

2. Update the web viewer:
   - In `RemoteTerminal.tsx`, change `new WebSocket(urlWithToken)` to `new WebSocket(meta.wsUrl)`.
   - On `ws.onopen`, immediately send `{ type: "auth", token }`.
   - Do not mark the terminal fully open until the host returns `hello`, or add a distinct `"authenticating"` state if useful.
   - Keep all existing `input`, `resize`, `ping`, `stop`, and revoke behavior after auth.

3. Update the host WebSocket route:
   - Stop reading `remoteControlToken` from `c.req.query`.
   - Do not authenticate or call `attachTerminalViewer` in `onOpen`.
   - Track an unauthenticated connection state in `ctx`.
   - In `onMessage`, if the socket is not authenticated:
     - Only accept `{ type: "auth", token }`.
     - Validate the token with `authenticateSession(sessionId, token)`.
     - Attach the terminal viewer only after successful auth.
     - Send the existing `hello`, `snapshot`, and possible `exit` messages after attach.
     - Close with `1008` on invalid auth.
   - Add a short auth timeout, for example 5 seconds, that closes unauthenticated sockets.
   - Ensure `cleanup()` remains idempotent for unauthenticated, partially attached, and fully attached sockets.

4. Update relay comments/logging:
   - Remove or rewrite comments that say the remote-control viewer must put its token on the WS upgrade URL.
   - Keep query redaction if normal host tunnel JWTs still use `?token=...`.

5. Add tests:
   - Host route/session-manager coverage for successful auth-first attach.
   - Host route coverage for missing auth message / auth timeout if practical.
   - Host route coverage for invalid auth message closing before terminal attach.
   - Web unit coverage is optional if the repo has no established pattern for this component.

## Strongly Recommended Before Broad Rollout

### 2. Make revoke retry semantics match the UI

Current behavior:

- Cloud marks the DB row `revoked` before calling the host.
- If the host revoke fails, the mutation throws.
- The desktop UI can later hydrate from `listForWorkspace`, see no active session, and lose the Stop affordance even though already-connected viewers may remain attached until host TTL sweep or host-side revoke.

Options:

1. Host-first revoke:
   - Call the host revoke first.
   - Only mark the DB row revoked after host teardown succeeds.
   - Tradeoff: future attaches could still pass cloud `get` while host revoke is in flight or failing.

2. Add a pending/failed revoke state:
   - Add statuses such as `revoking` or `revoke_failed`.
   - Keep the owner UI in a retryable state while connected viewers might still be attached.
   - `get` should still refuse to return `wsUrl` for `revoking` / `revoke_failed`.

3. Keep DB-first revoke but keep retry affordance:
   - `listForWorkspace` returns enough metadata for recently revoked sessions whose host teardown failed.
   - Desktop shows a "Retry host disconnect" action.

Recommended path: option 2 if the product wants accurate state, option 3 if we want minimal scope for this PR.

### 3. Enforce the PostHog feature flag server-side if it is an access gate

Current behavior:

- `FEATURE_FLAGS.WEB_REMOTE_CONTROL_ACCESS` hides the desktop Share button.
- `remoteControl.create` still allows any authenticated org+host member to start a session if they call the API directly.

Decision:

- If the flag is only UI rollout, update comments to say it is not an authorization boundary.
- If the flag controls who may start sessions, enforce it in `packages/trpc/src/router/remote-control/remote-control.ts` before minting a host token.

### 4. Require or explicitly configure web relay CSP

Current behavior:

- `apps/web/next.config.ts` adds the relay `wss:` origin to `connect-src` only when `process.env.RELAY_URL` exists.
- `apps/web/src/env.ts` does not validate `RELAY_URL`.

Add one of:

- A required web server env var for `RELAY_URL`.
- A dedicated `NEXT_PUBLIC_RELAY_URL` / `NEXT_PUBLIC_RELAY_WS_ORIGIN`.
- Deployment documentation and CI validation that web has the relay origin configured.

## Quality Cleanup

These are not merge blockers, but they are still valid review leftovers:

- Make the expiry-sweep test deterministic instead of sleeping around a timer.
- Use Node's native `"base64url"` encoding in `session-manager.ts`.
- Remove the unreachable try/catch around signature `base64UrlDecode`.
- Fix the `onRevoke` comment that says it fires synchronously while using `queueMicrotask`.
- Decide whether `runCommand` should share the input token bucket or have its own command bucket.
- Set `ctx.viewerSocket` only after `addViewer` succeeds to avoid cleanup doing a no-op remove on an unregistered socket.

## Validation Checklist

Run before asking for final review:

```bash
bun run --cwd apps/web typecheck
bun run --cwd packages/trpc typecheck
bun run --cwd packages/host-service typecheck
bun test packages/host-service/src/terminal/remote-control/session-manager.test.ts
bun run lint
git diff --check
```

If the WebSocket auth flow changes substantially, also manually verify:

- Anonymous viewer opens a copied share link without a Superset session.
- Invalid token never attaches to a terminal.
- Revoked and expired sessions do not receive `wsUrl` from cloud and cannot attach to host.
- First WebSocket request URL contains no `remoteControlToken` or raw bearer token.
- Relay and host logs do not print the auth message payload.
