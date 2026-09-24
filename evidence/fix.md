# P1-B — FIX and regression evidence

## Shape of the fix

One shared guard, `packages/shared/src/upstream-url.ts`, with two entry points:

- `resolveUpstreamUrl(origin, requestTarget)` — for a hop that *resolves* a target and then sends
  a secret to the result. Returns the URL only if it provably lands on `origin`; null otherwise.
- `isOriginFormTarget(requestTarget)` — the syntactic half, for a hop that *forwards* a target on
  without resolving it (the relay). `resolveUpstreamUrl` is built on it, so the two can't drift.

Both defects were the same mistake in two dialects — relative-URL resolution in the gate,
string concatenation in the tunnel client — so the guard checks the target *and* re-checks the
resolved origin rather than trusting either style of construction:

1. must start with `/` (kills `@evil.example/x`, `:pw@evil.example/x`, `http://evil.example/x`);
2. second character may not be `/` or `\` (kills protocol-relative);
3. no C0 control, space or DEL (kills `/<tab>/evil.example`, which the URL parser strips back
   into a protocol-relative target *after* a naive prefix check has passed);
4. after parsing, `upstream.origin` must equal the base origin, and there must be no
   username/password. Rules 1–3 make the refusal legible; rule 4 is what keeps it correct if URL
   parsing grows a new corner.

Nothing is normalized or repaired — a target that tried to move the origin is refused.

## Call sites

| File | Before | After |
| --- | --- | --- |
| `apps/gate/src/index.ts:66-75` | `new URL(path+search, claims.target)`, then `Bearer <hostSecret>` | `resolveUpstreamUrl(claims.target, path+search)`; null ⇒ 400 **before** the secret is derived |
| `packages/host-service/src/tunnel/tunnel-client.ts:345-359` | `fetch(\`http://127.0.0.1:${port}${header.path}\`)` with `Bearer <hostServiceSecret}\`` | `resolveUpstreamUrl(this.localOrigin("http"), header.path)`; null ⇒ `http:response` 400 back to the relay, no fetch |
| `packages/host-service/src/tunnel/tunnel-client.ts:221-226` (ws dial) | `localUrl.pathname = dial.path` | same guard; null ⇒ `reportDialFailed`. Was not exploitable (`.pathname` cannot move a host) — routed through the guard so the two legs cannot diverge |
| `apps/relay/src/index.ts:319` (ws route) | hand-rolled `path.startsWith("//")`, bypassable via tab/newline | `isOriginFormTarget(path)` |
| `apps/relay/src/index.ts:267` (trpc route) | no check | `isOriginFormTarget(path)` |

The last two are outside the two advisories but are the same defect class, and one of them was an
existing *wrong* check — replacing them is what makes the guard the single definition rather than
a fourth variant. `localOrigin()` on the tunnel client names the one origin that host ever proxies
to, so a future caller has the right thing to pass.

First-party flows are unchanged and covered: an ordinary proxied path keeps its query and
escaping, and a WebSocket upgrade still has its `token` query param swapped for the derived host
secret (`apps/gate/src/index.test.ts`).

## Regression tests (co-located)

- `packages/shared/src/upstream-url.test.ts` — the guard itself, both entry points.
- `apps/gate/src/index.test.ts` — new file; drives the real worker `fetch` handler with a real
  signed ticket and a stubbed global `fetch`, asserting where the `Authorization` header went.
  `apps/gate` had no test script before; one was added, plus `bun` types in its tsconfig.
- `packages/host-service/src/tunnel/tunnel-client.upstream.test.ts` — drives the real
  `forwardHttp` with a fake relay dial-back socket.

### Before / after

Captured by running the *new* tests against the unmodified `apps/gate/src/index.ts` and
`tunnel-client.ts` (source stashed, tests kept), then against the fixed source.

| Suite | Before (vulnerable source) | After |
| --- | --- | --- |
| `apps/gate` — `bun test src/index.test.ts` | `evidence/gate-before.txt`: **2 pass, 5 fail**, exit 1 | `evidence/gate-after.txt`: **8 pass, 0 fail**, exit 0 |
| `packages/host-service` — `bun test src/tunnel/` | `evidence/tunnel-before.txt`: **4 pass, 4 fail**, exit 1 | `evidence/tunnel-after.txt`: **19 pass, 0 fail**, exit 0 (includes the pre-existing `tunnel-client.test.ts` and `tunnel-client.integration.test.ts`) |
| `packages/shared` — guard + gate ticket tests | n/a (guard is new) | `evidence/shared-guard-after.txt`: **14 pass, 0 fail**, exit 0 |

The before-runs are the proof, not a simulation. Gate, showing the derived host secret arriving at
the attacker's origin:

```
- []
+ [
+   {
+     "authorization": "Bearer DoO8tHkWvtlycpGXlCnD4i3FWEmDJS2phJDPF4HOxRA",
+     "url": "https://evil.example/x",
+   },
+ ]
```

Tunnel client, showing HOST_SERVICE_SECRET arriving at the relay-chosen origin:

```
- []
+ [
+   {
+     "authorization": "Bearer host-service-secret",
+     "url": "http://127.0.0.1:38017@evil.example/x",
+   },
+ ]
```

(`http://127.0.0.1:38017@evil.example/x` has origin `http://evil.example` — everything before the
`@` is userinfo.)

## Other checks

```
$ bunx turbo typecheck --filter=@superset/gate --filter=@superset/shared \
    --filter=@superset/host-service --filter=@superset/relay
 Tasks:    8 successful, 8 total

$ bunx turbo test --filter=@superset/shared --filter=@superset/gate
 @superset/shared:test: 1114 pass, 0 fail
 Tasks:    3 successful, 3 total

$ bunx @biomejs/biome@2.4.2 check --write --unsafe <changed paths>
 Checked 28 files. No fixes applied.

$ bunx sherif@1.11.0
 ✓ No issues found
```

`bun run check:i18n` was not run: the change adds no user-facing strings (the two new messages are
`console.warn` diagnostics, which are not translated).

### One pre-existing failure, not caused by this change

`packages/host-service` `health.check > serialises the current boot's stamps and the runtime in
sandbox mode` fails. Confirmed pre-existing by stashing every change on this branch and re-running
on the clean tree — it fails identically there (`1 pass, 1 fail`). Left alone.
