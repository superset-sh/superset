# SUPER-750 Evidence: Static Trace

## Method

Static code trace with exact file:line citations. No EC2 instance available for live repro, but every gap claim is grounded in verified source lines.

---

## Gap 1 — `shouldOpenBrowser()` does not detect remote-workspace context

**File:** `packages/cli/src/lib/auth.ts:58-63`

```typescript
function shouldOpenBrowser(): boolean {
    if (!process.stdout.isTTY) return false;      // line 59
    if (process.env.CI) return false;              // line 60
    if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return false;  // line 61
    return true;                                   // line 62
}
```

**What is missing:**

1. **`SUPERSET_WORKSPACE_ID` not checked.** The host-service terminal environment injector at `packages/host-service/src/terminal/env.ts:185` sets `env.SUPERSET_WORKSPACE_ID = workspaceId` in every terminal spawned inside a Superset workspace. When the CLI runs in such a terminal, `process.env.SUPERSET_WORKSPACE_ID` is set. `shouldOpenBrowser()` never reads this variable. Therefore, a CLI process inside a Superset remote workspace (where the user's browser is on their laptop, not the remote host) returns `true` and the browser opens on the remote host.

2. **`DISPLAY` (Linux headless) not checked.** On Linux systems without a graphical session (EC2, headless servers), `DISPLAY` is unset. `shouldOpenBrowser()` does not check `process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY`. On such a system, `xdg-open` (called at `auth.ts:50`) silently fails or opens nothing on the remote host while returning no error to the CLI.

---

## Gap 2 — `bindLoopbackServer()` is called unconditionally before the browser check

**File:** `packages/cli/src/lib/auth.ts:295`

```typescript
const loopback = await bindLoopbackServer();   // line 295 — always called
```

`login()` calls `bindLoopbackServer()` at line 295, before `shouldOpenBrowser()` is evaluated at line 319. This means even in cross-device contexts where `shouldOpenBrowser()` correctly returns `false`, the CLI still:
- Binds a TCP port on localhost (5 attempts across ports 51789–51793, `auth.ts:69-87`)
- Registers an HTTP request handler on that server (`auth.ts:119-156`)
- Holds the `loopback` object alive for the duration of the login race (`auth.ts:352-368`)

None of this listener is reachable from the user's remote browser, so the resource is wasted. The paste flow always wins in this context, but the loopback server binds and waits regardless.

---

## Gap 3 — `--no-browser` flag does not exist

**File:** `packages/cli/src/commands/auth/login/command.ts:148-155`

```typescript
options: {
    organization: string().desc(...),
    apiKey: string().desc(...),
    // no noBrowser / no-browser option
},
```

There is no `--no-browser` flag. Users cannot force paste-only mode from the command line. The only escape hatch is `--api-key`, which requires a pre-existing API key and bypasses OAuth entirely.

---

## Gap 4 — UI copy implies browser will open even when it won't

**File:** `packages/cli/src/commands/auth/login/LoginUI.tsx:99`

```typescript
<Text>Browser didn't open? Use the url below to sign in </Text>
```

**File:** `packages/cli/src/commands/auth/login/command.ts:218`

```typescript
p.log.message("Browser didn't open? Use the url below to sign in");
```

Both UI paths frame the paste URL as a fallback for when the browser failed. In cross-device contexts where we skip the browser intentionally, this copy is misleading — it implies a browser attempt happened. The paste flow should be presented as the primary path with different copy.

---

## Gap 1 supplementary — `DISPLAY` on Linux `xdg-open`

**File:** `packages/cli/src/lib/auth.ts:48-51`

```typescript
default:
    exec(`xdg-open "${url}"`);
```

On Linux without `DISPLAY`, `xdg-open` may fail silently or produce an error that is not surfaced to the user (the return value of `exec` is not awaited or checked — `openBrowser` is called with `void` at `auth.ts:320`). The user sees nothing — the browser "attempt" produces no feedback and the loopback port is bound but unreachable.

---

## Safari `response_type` check (gotcha, not in scope)

**File:** `packages/cli/src/lib/auth.ts:177-198` — `buildAuthorizeUrl()`

Both `pasteAuthorizeUrl` (line 301) and `browserAuthorizeUrl` (line 308) use the same `buildAuthorizeUrl()` helper, which always sets `response_type=code` (line 190). The URL construction is deterministic and identical for both flows. The Safari failure Daniel reported is therefore NOT a `response_type` problem from this code. It is likely a redirect/cookie issue on the Safari side (possibly third-party cookie blocking affecting the OAuth redirect). This is a separate investigation.

---

## Summary table

| Gap | File:Line | Verified |
|-----|-----------|---------|
| `shouldOpenBrowser()` missing `SUPERSET_WORKSPACE_ID` check | `auth.ts:58-62` | Yes — variable injected at `host-service/terminal/env.ts:185`, never read in `shouldOpenBrowser()` |
| `shouldOpenBrowser()` missing Linux `DISPLAY`/`WAYLAND_DISPLAY` check | `auth.ts:58-62` | Yes — no DISPLAY check anywhere in `packages/cli/src` |
| `bindLoopbackServer()` called unconditionally before browser check | `auth.ts:295` vs `auth.ts:319` | Yes — order confirmed by reading `login()` in full |
| `--no-browser` flag absent | `command.ts:148-155` | Yes — options object has only `organization` and `apiKey` |
| UI copy frames paste as browser-fail fallback | `LoginUI.tsx:99`, `command.ts:218` | Yes — both code paths use "Browser didn't open?" phrasing |
| `response_type=code` consistent across both URLs | `auth.ts:190`, `auth.ts:301-315` | Yes — Safari issue is NOT caused by this code |
