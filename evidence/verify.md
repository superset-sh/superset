# P1-B — VERIFY (read-only pass)

Tree: branch `superset/p1-b-host-secret-origin-6d4f2cc2`, base commit `65da26d`, working tree clean
at the time of this pass. Every quote below is the current code on that tree.

## Blocker: advisory bodies unavailable

```
$ gh api repos/superset-sh/superset/security-advisories/GHSA-8qrv-53x7-hh4p --jq .description
{"message":"Resource not accessible by integration", ... "status":"403"}
$ gh api repos/superset-sh/superset/security-advisories/GHSA-h894-rmgp-jv6m --jq .description
{"message":"Resource not accessible by integration", ... "status":"403"}
```

The GitHub token in this sandbox has no `security_events`/repository-advisory scope, so the full
advisory text could not be read. Verification below works from the task brief's claims plus the
code, and does not rely on any detail only the advisory body would carry. Anything the advisories
assert that is *not* restated in the brief is unverified here — notably the exact
cross-tenant-reach question for GHSA-8qrv-53x7-hh4p, which the brief already says the report does
not establish.

---

## Claim 1 — GHSA-8qrv-53x7-hh4p (Medium): the gate builds its upstream from the request PATH

**Verdict: CONFIRMED.**

`apps/gate/src/index.ts:63-75`:

```ts
		const hostSecret = await sandboxHostSecret(
			env.SANDBOX_GATE_SECRET,
			claims.workspaceId,
		);
		const upstream = new URL(`${url.pathname}${url.search}`, claims.target);
		if (upstream.searchParams.has(SANDBOX_GATE_TICKET_PARAM)) {
			upstream.searchParams.set(SANDBOX_GATE_TICKET_PARAM, hostSecret);
		}
		const headers = new Headers(request.headers);
		headers.set("authorization", `Bearer ${hostSecret}`);
		headers.set(SUPERSET_USER_ID_HEADER, claims.userId);

		const response = await fetch(upstream, {
```

`claims.target` is used only as the *base* of a relative URL resolution. A request path that is
protocol-relative discards the base's origin entirely, and the header set on the next line carries
the workspace's host secret to whatever host the path named:

```
$ node -e 'console.log(new URL("//evil.com/x", "https://sandbox.vercel.run").href)'
https://evil.com/x
```

Nothing between the ticket check and the `fetch` constrains the resolved origin. The two checks
that do run are both about something else:

- `apps/gate/src/index.ts:46-49` — `verifySandboxGateTicket` only proves the ticket was signed by
  the shared secret and has not expired.
- `apps/gate/src/index.ts:52-61` — `parseSandboxGateHost(url.hostname, ...)` binds the *request
  hostname* to the ticket's workspace and port. It reads `url.hostname`, never `url.pathname`, so
  it is untouched by this path.

There is no origin allowlist anywhere in `apps/gate/src/` (`env.ts` holds only
`SANDBOX_GATE_SECRET` and `SANDBOX_GATE_DOMAIN`), and no guard in
`packages/shared/src/sandbox-gate.ts`. Preconditions match the brief: the attacker needs a valid
unexpired ticket, i.e. their own ready workspace. With `SANDBOX_GATE_DOMAIN` set they must also
send the request to their own `<workspaceId>-<port>.<domain>` hostname — which they can, it is
their workspace. The secret disclosed is `sandboxHostSecret(secret, claims.workspaceId)`, i.e.
**their own** workspace's host secret, which is why this is Medium and not cross-tenant: the gate
derives it from the ticket's workspace, not from the path. What the bug gives away is that secret
plus a full SSRF from the gate Worker.

## Claim 2 — GHSA-h894-rmgp-jv6m (High): the tunnel client sends HOST_SERVICE_SECRET to a relay-selected origin

**Verdict: CONFIRMED.**

`packages/host-service/src/tunnel/tunnel-client.ts:349-359`:

```ts
			const response = await fetch(
				`http://127.0.0.1:${this.options.localPort}${header.path}`,
				{
					method: header.method,
					headers: {
						...header.headers,
						Authorization: `Bearer ${this.options.hostServiceSecret}`,
					},
					body: size > 0 ? body : undefined,
				},
			);
```

`header` is `frame` from `serveHttpDial` (`tunnel-client.ts:303-316`), which is
`JSON.parse(data)` of a text frame arriving on the relay dial-back socket — cast straight to
`HttpDialFrame` with no schema check. `header.path` is therefore whatever the relay sends. The
string concatenation means a path that starts with `@` moves the *host*, because everything
before the `@` becomes userinfo:

```
$ node -e 'console.log(new URL("http://127.0.0.1:38017@evil.com/x").origin)'
http://evil.com
```

The `Authorization: Bearer <hostServiceSecret>` header is attached unconditionally on the very
next lines, so the host secret goes to `evil.com`. Nothing checks the resolved origin before or
after: `forwardHttp` has no validation of `header.path` at all, and `HttpRequestHeader` in
`packages/shared/src/tunnel-protocol.ts:78-84` is a bare TypeScript interface — a compile-time
comment ("Path plus query string, ready to append to the local origin"), enforced nowhere.

Reachability of the origin move is exactly the advisory's framing — a *relay-selected* origin. The
relay the host trusts is chosen by `resolveRelayUrl` in
`packages/host-service/src/tunnel/connect.ts:31-45`, which takes `api.host.relayEndpoint.query()`
whenever it answers and otherwise the caller's fallback; `tunnel-client.ts:92-120` re-asks it on
every failed reconnect. A relay that is compromised, impersonated, or misresolved is the trust
boundary being crossed, and today the host grants it the secret on request. Whether an ordinary
*client* of a healthy relay can also steer `header.path` is a narrower question and I mark it
**PARTIAL**: `apps/relay/src/index.ts:262-280` builds `pathWithQuery` from
`pathAfterHost(c)` under the route `/hosts/:hostId/trpc/*`, so on a healthy relay the path a
client reaches this code with starts `/trpc/`. `pathAfterHost` (`index.ts:216-219`) slices the raw
pathname by the length of the *decoded* `hostId` param, so percent-encoding in the host segment
shifts the slice — but a caller cannot choose an arbitrary `hostId`, it must pass
`authenticate(c, hostId, "reach")` for a host they own, so I did not establish a working
client-side path. The host-side defect stands on its own regardless.

## Related finding (not in either advisory, same root cause)

`apps/relay/src/index.ts:316-317`, the WebSocket route:

```ts
	const path = pathAfterHost(c) || "/";
	if (path.startsWith("//")) return c.json({ error: "Invalid path" }, 400);
```

This is the only origin-ish guard in the tree, and it is a bespoke one-off that misses the
tab/newline variant, which the URL parser strips before resolving:

```
$ bun -e 'console.log(new URL("/\t/evil.com/x", "http://127.0.0.1:38017").href)'
http://evil.com/x
```

That particular route is not exploitable today, because the ws leg of the client assigns
`localUrl.pathname = dial.path` (`tunnel-client.ts:215-217`) and assigning `.pathname` cannot
move a URL's host. But it is the same class of check, hand-rolled per call site and already wrong,
which is the argument for one shared guard rather than three.

## Not defects (checked, so the fix does not sprawl)

Other `Bearer <host secret>` senders all take their origin from a trusted server-side value, not
from a request target, and need no change:

- `packages/host-service/src/runtime/sandbox-credential-refresh/sandbox-credential-refresh.ts:16-23`
  — origin is `args.apiUrl`.
- `packages/trpc/src/lib/sandbox/vercel.ts:257` (`pushManagedEnv`) — origin is the stored sandbox
  `target`.
- `packages/sandbox/src/environments/probe.ts:82-85,223-226` — dev/CI probe against a host origin
  it computed itself.
- `tunnel-client.ts:215-221` (ws dial) — `.pathname` assignment, host cannot move.

---

## Outcome

Both CONFIRMED claims are fixed behind one shared guard; see `evidence/fix.md` for the
implementation, the call-site table and the before/after runs.
