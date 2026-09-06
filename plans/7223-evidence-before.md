# #7223 evidence, BEFORE the fix

Captured 2026-09-06 on branch `fix/7223-host-registration-remote-access-off` at commit `94056be3a4`.

## Setup

The host-service was started the way the desktop coordinator starts it with Remote Access off:
`packages/host-service/src/serve.ts` under Electron-as-Node (better-sqlite3 is built for the Electron ABI),
with the coordinator's child env mirrored (`ORGANIZATION_ID`, `HOST_SERVICE_SECRET`, `HOST_SERVICE_PORT`,
`HOST_DB_PATH`, `HOST_MIGRATIONS_FOLDER`, `SUPERSET_HOME_DIR`, `AUTH_TOKEN`, `SUPERSET_API_URL`,
`HOST_PARENT_PID`) and **`RELAY_URL` deleted**, which is what `buildEnv` in
`apps/desktop/src/main/lib/host-service-coordinator.ts` does when `exposeHostServiceViaRelay` is false.

`SUPERSET_API_URL` pointed at a local fake of api.superset.sh (`scratchpad/fake-cloud.ts`) that speaks the
tRPC batch envelope and records every `host.ensure` call, so "was registration ever attempted" is a fact
read back from `/__state`, not an inference. `SUPERSET_HOME_DIR` was a scratch dir, and the org id a fake
uuid, so nothing touched the desktop's real hosts or pty-daemons.

Launcher: `scratchpad/run-host.sh`. CLI: `packages/cli/dist/superset-7223`, built with
`SUPERSET_API_URL=http://127.0.0.1:4999` baked in (the CLI bakes its API URL at build time), run with
`SUPERSET_HOME_DIR` set to the scratch home that holds a manifest for this host.

## (a) host-service log: bootstrap OK, no registration attempt, nothing logged about it

```
2026-09-06T17:04:22.900Z [host-service] starting (org=11111111-2222-4333-8444-555555555555, port=4877, NODE_ENV=development)
2026-09-06T17:04:22.901Z [supervisor] kicking off bootstrap for org=11111111-2222-4333-8444-555555555555
2026-09-06T17:04:22.915Z [host-service:db] Initialized at /private/tmp/claude-501/-Users-kietho--superset-worktrees-1c99c8eb-1b31-4f04-9ac4-61a2760c74b6-fix-7223-host-registration-remote-access-off/f4bf6181-b6a3-480c-8e9d-5b636a4966fa/scratchpad/home/host/11111111-2222-4333-8444-555555555555/host.db, migrations from /Users/kietho/.superset/worktrees/1c99c8eb-1b31-4f04-9ac4-61a2760c74b6/fix/7223-host-registration-remote-access-off/packages/host-service/drizzle
2026-09-06T17:04:22.925Z [host-service] listening on http://127.0.0.1:4877
2026-09-06T17:04:22.943Z [pty-daemon:11111111-2222-4333-8444-555555555555] spawning /Users/kietho/.superset/worktrees/1c99c8eb-1b31-4f04-9ac4-61a2760c74b6/fix/7223-host-registration-remote-access-off/packages/pty-daemon/dist/pty-daemon.js → /var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock (log: /private/tmp/claude-501/-Users-kietho--superset-worktrees-1c99c8eb-1b31-4f04-9ac4-61a2760c74b6-fix-7223-host-registration-remote-access-off/f4bf6181-b6a3-480c-8e9d-5b636a4966fa/scratchpad/home/host/11111111-2222-4333-8444-555555555555/pty-daemon.log)






[ptyd:11111111] [pty-daemon] listening on /var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock (v0.3.3, host=Kiets-Spaceship.local)
2026-09-06T17:04:23.247Z [pty-daemon:11111111-2222-4333-8444-555555555555] spawned pid=55448 socket=/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock
2026-09-06T17:04:23.247Z {"component":"pty-daemon-supervisor","event":"pty_daemon_spawn","organizationId":"11111111-2222-4333-8444-555555555555","pid":55448,"socketPath":"/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock","daemonVersion":"0.3.3"}
2026-09-06T17:04:23.247Z [supervisor] bootstrap OK for org=11111111-2222-4333-8444-555555555555 pid=55448 version=0.3.3
```

Zero `registered as host`, `failed to register`, or `relay:` lines. Same pattern the issue reports
(`[supervisor] bootstrap OK` + port-scan/reaper lines only).

Fake cloud after the host had been up for over a minute:

```
$ curl -s http://127.0.0.1:4999/__state
{"ensureCalls":[],"hosts":{},"requests":[]}
```

The host-service made **no request at all** to the API. Registration was never attempted.

## (b) health.check: cloudRegistered false, registrationError null

```
$ curl -s -H "Authorization: Bearer repro-secret-7223" http://127.0.0.1:4877/trpc/health.check
{"result":{"data":{"json":{"status":"ok","cloudRegistered":false,"registrationError":null}}}}
```

"Never attempted" is indistinguishable from "attempt in flight".

## (c) CLI against this host

`superset status` (text mode):

```
Repro Org: host 300d922f… running (pid 55229, up 3 minutes)
Warning: not registered with the cloud for Repro Org — hosts list and automations won't see this machine
Hint: check host-service.log; registration retries automatically, or run: superset stop && superset start
```

Both hints are wrong in this state: nothing is retrying, and host-service.log has nothing to check.

`superset status --json`:

```
{
  "running": true,
  "healthy": true,
  "pid": 55229,
  "port": 4877,
  "endpoint": "http://127.0.0.1:4877",
  "organizationId": "11111111-2222-4333-8444-555555555555",
  "hostId": "300d922f3b90fd4955ae39163bda4431",
  "hostName": null,
  "cloudRegistered": false,
  "uptimeSec": 1
}
```

`superset hosts list`:

```
[]
```

`superset automations create --name repro-7223 --prompt "say hi" --rrule "FREQ=DAILY"`:

```
Error: This machine (host 300d922f3b90fd4955ae39163bda4431) isn't registered with the cloud
Hint: Restart the host service (superset stop && superset start), then check: superset hosts list
exit=1
```

Restarting does nothing: the toggle is persisted and re-applied on every spawn.

## (d) Failing automated test

`packages/host-service/test/integration/cloud-registration-without-relay.integration.test.ts` boots the real
`serve.ts` entry with the coordinator's Remote-Access-off env against a fake cloud and asserts `host.ensure`
is called. Before the fix:

```
$ cd packages/host-service && bun test test/integration/cloud-registration-without-relay.integration.test.ts
error: host.ensure was never called. host-service output:
2026-09-06T17:07:44.098Z [host-service] starting (org=11111111-2222-4333-8444-555555555555, port=61302, NODE_ENV=development)
2026-09-06T17:07:44.099Z [supervisor] kicking off bootstrap for org=11111111-2222-4333-8444-555555555555
2026-09-06T17:07:44.124Z [host-service:db] Initialized at .../host.db, migrations from .../packages/host-service/drizzle
2026-09-06T17:07:44.146Z [host-service] listening on http://127.0.0.1:61302
2026-09-06T17:07:44.158Z [pty-daemon:11111111-...] spawning .../packages/pty-daemon/dist/pty-daemon.js → /var/folders/.../superset-ptyd-cf4c4732fd3b.sock
2026-09-06T17:07:44.265Z [pty-daemon:11111111-...] spawned pid=72171 socket=...
2026-09-06T17:07:44.265Z [supervisor] bootstrap OK for org=11111111-2222-4333-8444-555555555555 pid=72171 version=0.3.3
Expected: true
Received: false
(fail) registers with the cloud when started without RELAY_URL (Remote Access off) [10076.39ms]
 0 pass
 1 fail
```
