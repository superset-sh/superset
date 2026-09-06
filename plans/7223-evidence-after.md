# #7223 evidence, AFTER the fix

Same reproduction as `plans/7223-evidence-before.md`: `serve.ts` under Electron-as-Node with the desktop
coordinator's Remote-Access-off child env (`RELAY_URL` deleted), fake cloud at `127.0.0.1:4999` recording
`host.ensure`, scratch `SUPERSET_HOME_DIR`, CLI binary rebuilt from the fixed source with the fake API URL
baked in. Fake cloud state was reset before the relaunch.

One repro-harness correction versus the before run: this workspace terminal exports
`SUPERSET_ORGANIZATION_ID` for the real org, and the CLI honours it over `config.json`. The CLI runs below
unset it so `automations create` resolves the fake org (the before-run failure was at the registration
check and is unaffected by that).

## (a) host-service log: registration happens, relay skip is logged explicitly

```
2026-09-06T17:12:28.792Z [host-service] starting (org=11111111-2222-4333-8444-555555555555, port=4877, NODE_ENV=development)
2026-09-06T17:12:28.793Z [supervisor] kicking off bootstrap for org=11111111-2222-4333-8444-555555555555
2026-09-06T17:12:28.820Z [host-service:db] Initialized at /private/tmp/claude-501/-Users-kietho--superset-worktrees-1c99c8eb-1b31-4f04-9ac4-61a2760c74b6-fix-7223-host-registration-remote-access-off/f4bf6181-b6a3-480c-8e9d-5b636a4966fa/scratchpad/home/host/11111111-2222-4333-8444-555555555555/host.db, migrations from /Users/kietho/.superset/worktrees/1c99c8eb-1b31-4f04-9ac4-61a2760c74b6/fix/7223-host-registration-remote-access-off/packages/host-service/drizzle
2026-09-06T17:12:28.829Z [host-service] listening on http://127.0.0.1:4877
2026-09-06T17:12:28.861Z [host-service] registered as host 300d922f3b90fd4955ae39163bda4431
2026-09-06T17:12:28.861Z [host-service] relay disabled (no RELAY_URL: Remote Access is off) — not connecting; this host shows offline in hosts list and automations can't run on it until Remote Access is turned on
2026-09-06T17:12:28.866Z [pty-daemon:11111111-2222-4333-8444-555555555555] spawning /Users/kietho/.superset/worktrees/1c99c8eb-1b31-4f04-9ac4-61a2760c74b6/fix/7223-host-registration-remote-access-off/packages/pty-daemon/dist/pty-daemon.js → /var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock (log: /private/tmp/claude-501/-Users-kietho--superset-worktrees-1c99c8eb-1b31-4f04-9ac4-61a2760c74b6-fix-7223-host-registration-remote-access-off/f4bf6181-b6a3-480c-8e9d-5b636a4966fa/scratchpad/home/host/11111111-2222-4333-8444-555555555555/pty-daemon.log)






[ptyd:11111111] [pty-daemon] listening on /var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock (v0.3.3, host=Kiets-Spaceship.local)
2026-09-06T17:12:28.969Z [pty-daemon:11111111-2222-4333-8444-555555555555] spawned pid=91089 socket=/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock
2026-09-06T17:12:28.969Z {"component":"pty-daemon-supervisor","event":"pty_daemon_spawn","organizationId":"11111111-2222-4333-8444-555555555555","pid":91089,"socketPath":"/var/folders/6p/h3cw025x0z38clvxby6gqylh0000gn/T/superset-ptyd-7fbd8678bfca.sock","daemonVersion":"0.3.3"}
2026-09-06T17:12:28.969Z [supervisor] bootstrap OK for org=11111111-2222-4333-8444-555555555555 pid=91089 version=0.3.3
```

Fake cloud:

```
$ curl -s http://127.0.0.1:4999/__state
{
    "ensureCalls": [
        {
            "at": "2026-09-06T17:12:28.856Z",
            "input": {
                "organizationId": "11111111-2222-4333-8444-555555555555",
                "machineId": "300d922f3b90fd4955ae39163bda4431",
                "name": "Kiets-Spaceship"
            }
        }
    ],
    "requests": [
        "2026-09-06T17:12:28.856Z POST host.ensure"
    ]
}
```

`host.ensure` was called once, 32 ms after listen. No relay endpoint lookup, no tunnel, as intended.

## (b) health.check: registered, relay reported as disabled

```
$ curl -s -H "Authorization: Bearer repro-secret-7223" http://127.0.0.1:4877/trpc/health.check
{"result":{"data":{"json":{"status":"ok","cloudRegistered":true,"registrationError":null,"relayEnabled":false}}}}
```

## (c) CLI against this host

`superset status` (text mode):

```
Repro Org: Kiets-Spaceship (300d922f…) running (pid 91028, up 3 minutes)
Warning: Remote Access is off for this machine — it shows offline in hosts list and automations can't run on it
Hint: turn it on in the Superset app under Settings → Remote Access
```

`superset status --json`:

```
{
  "running": true,
  "healthy": true,
  "pid": 91028,
  "port": 4877,
  "endpoint": "http://127.0.0.1:4877",
  "organizationId": "11111111-2222-4333-8444-555555555555",
  "hostId": "300d922f3b90fd4955ae39163bda4431",
  "hostName": "Kiets-Spaceship",
  "cloudRegistered": true,
  "relayEnabled": false,
  "uptimeSec": 1
}
```

`superset hosts list` (the machine now exists server-side; `local` is what the CLI prints for this
machine when it has no relay presence):

```
NAME             ONLINE  ID
Kiets-Spaceship  local   300d922f3b90fd4955ae39163bda4431
```

`superset automations create --name repro-7223 --prompt "say hi" --rrule "FREQ=DAILY"`:

```
Error: Remote Access is off for this machine, so automations can't run on it
Hint: Turn it on in the Superset app under Settings → Remote Access, then retry
exit=1
```

The fake cloud received no `automation.create` for this run. The explicit `--host` path is unchanged:

```
$ superset automations create ... --host deadbeef
Error: Host deadbeef is not registered in this organization
Hint: Run: superset hosts list
exit=1
```

## (d) The previously failing test now passes

```
$ cd packages/host-service && bun test test/integration/cloud-registration-without-relay.integration.test.ts
bun test v1.3.11 (af24e281)
 1 pass
 0 fail
 4 expect() calls
Ran 1 test across 1 file. [2.08s]
```

Plus the new CLI cases in `packages/cli/src/commands/automations/resolveAutomationTarget.test.ts`
(6 pass) and the updated smoke test (6 pass).
