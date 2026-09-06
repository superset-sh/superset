# #7223 report: host service running but never registers with cloud

Branch `fix/7223-host-registration-remote-access-off`. No PR opened, nothing merged.

## Root cause

Cloud registration (`host.ensure`, the only call that creates the `v2Hosts` row that `hosts list` and
automations depend on) lived inside `connectRelay`, and both entry points only called `connectRelay` when
`RELAY_URL` was set:

- `packages/host-service/src/serve.ts` (standalone/CLI-launched host)
- `apps/desktop/src/main/host-service/index.ts` (desktop-spawned host)

The desktop coordinator (`apps/desktop/src/main/lib/host-service-coordinator.ts`, `buildEnv`) deletes
`RELAY_URL` from the child env whenever the Remote Access setting (`exposeHostServiceViaRelay`, default
false) is off. So every desktop with Remote Access off started a host that never attempted registration,
logged nothing about it, and reported `cloudRegistered: false` with no error, which is byte-identical to
"first attempt still in flight". `superset status` then told the user that registration retries
automatically, which was false, and `automations create` told them to restart the host, which cannot help
because the setting is persisted and re-applied on every spawn. This is why #6415's fix (retry with backoff
plus a status warning) did not cover it: that fix only helps once an attempt is made.

Verified, not assumed: the reproduction in `plans/7223-evidence-before.md` shows a host with the
coordinator's exact env making zero API requests while healthy locally.

## Can the cloud dispatch automations to a host that is not on the relay?

No. `packages/trpc/src/router/automation/dispatch.ts` picks an online host via relay presence
(`fetchRelayPresence`) and sends the run through `relayMutation`; a host with no relay socket is
`skipped_offline`. So the relay is genuinely required for runs, but not for registration: `host.ensure`
in `packages/trpc/src/router/host/host.ts` only inserts the host row and the owner link, and `host.list`
already tolerates rows with no presence (it reports them `online: false`). Registration without the relay
is meaningful: it makes the machine visible, and it turns the failure from silent into a stated setting.

## The fix

Decouple registration from the tunnel, make the relay skip a real, reported state, and have the CLI say so.

- `packages/host-service/src/tunnel/connect.ts`: `relayUrl` is now `string | null`. Registration (with its
  retry loop) always runs; when `relayUrl` is null it records the relay as disabled, logs
  `relay disabled (no RELAY_URL: Remote Access is off) — not connecting ...`, and returns without opening a
  tunnel.
- `packages/host-service/src/tunnel/registration-state.ts`: new `relayEnabled: boolean | null` field, set
  on registration success.
- `packages/host-service/src/trpc/router/health/health.ts`: `health.check` returns `relayEnabled`.
- `packages/host-service/src/serve.ts` and `apps/desktop/src/main/host-service/index.ts`: call
  `connectRelay` whenever there is an org (sandbox mode still never registers), passing
  `env.RELAY_URL ?? null`.
- `packages/cli/src/lib/host/health.ts` (new): the health probe moved out of `status` so
  `automations create` can use it, plus `checkLocalHostHealth(orgId)` which reads this machine's manifest.
- `packages/cli/src/commands/status/command.ts`: when the host reports `relayEnabled: false`, prints
  "Remote Access is off for this machine ... turn it on in the Superset app under Settings → Remote Access"
  instead of the registration warning. The "registration retries automatically" hint is now only reachable
  when an attempt has actually been made. `--json` gains `relayEnabled`.
- `packages/cli/src/commands/automations/resolveAutomationTarget.ts`: for the local machine (no `--host`),
  after the registration preflight, asks the local host-service; if it reports the relay disabled it refuses
  with the same Settings hint rather than creating an automation whose every run would be skipped.

The desktop coordinator is untouched: stripping `RELAY_URL` is the correct way to keep the tunnel closed,
and the host now does the right thing with that env. A side effect worth noting: the desktop's
`RelayOfflineNotice` in the automations UI returns null when the local host has no cloud row
(`localHostIsOnline === null`); with the host now registered, that becomes `false` and the existing
"enable relay access" affordance renders in exactly this state, without touching renderer code. I did not
verify that in the running app (see below).

Not done, on purpose: no rename of `connectRelay`, no restructuring of the retry loop, no change to the
dispatch path.

## Evidence

- Before: `plans/7223-evidence-before.md` (log, `health.check`, fake-cloud request ledger, `status`,
  `hosts list`, `automations create`, failing test output).
- After: `plans/7223-evidence-after.md` (same reproduction, registration observed, explicit log line,
  new `status` and `automations create` output, test passing).

## Tests

- New, failed before the fix and passes after:
  `packages/host-service/test/integration/cloud-registration-without-relay.integration.test.ts`. It boots
  the real `serve.ts` under Electron-as-Node (better-sqlite3 is built for the Electron ABI, same as
  `scripts/test-e2e.ts`) with the coordinator's Remote-Access-off env against a fake cloud, and asserts
  `host.ensure` is called and `health.check` reports registered. HOME and SUPERSET_HOME_DIR are
  redirected to a temp dir because `serve.ts` provisions agent hooks into the user's agent config dirs.
- New CLI cases in `packages/cli/src/commands/automations/resolveAutomationTarget.test.ts` (relay disabled
  refuses with the Settings hint; enabled or unsettled passes; explicit `--host` does not consult the
  local host). The probe is injected there because `SUPERSET_HOME_DIR` is read at module load and bun
  caches modules across test files.
- `smoke.integration.test.ts` updated for the new `relayEnabled` field.

## Checks run

| Check | Result |
| --- | --- |
| `packages/host-service`: `bun test test/integration/cloud-registration-without-relay.integration.test.ts` | 1 pass (was 1 fail) |
| `packages/host-service`: `bun test test/integration/smoke.integration.test.ts` | 6 pass |
| `packages/host-service`: `bun run typecheck` | clean |
| `packages/cli`: `bun test` (whole package) | 232 pass |
| `packages/cli`: `bun run typecheck` | clean |
| `apps/desktop`: `bun run typecheck` | clean |
| `biome check` on every changed file | clean |

## Not verified

- The desktop app itself was not rebuilt or run with Remote Access off; the desktop entry change is
  covered by typecheck and by the identical gate in `serve.ts` being exercised by the integration test.
  The `RelayOfflineNotice` now rendering is reasoned from `useWorkspaceHostOptions`, not observed.
- The real API was not hit. The fake cloud implements `host.ensure`/`host.list` from the router's shape;
  `host.ensure` on the real server is an idempotent insert with `onConflictDoNothing`, so repeated
  registrations from hosts that previously never registered should be harmless, but I did not run it.
- The integration test was run on macOS only. It resolves the Electron binary through the `electron`
  package from `apps/desktop`, which should work on Linux CI under `ELECTRON_RUN_AS_NODE`, but that run has
  not happened.
- `bun run check:i18n` was not run: the CLI messages touched are plain strings like the existing ones in
  those files, and host-service log lines are not user-facing catalog strings.
- Side effect of the manual reproduction on this machine: `serve.ts` re-provisioned the managed agent hook
  entries (for example in `~/.claude/settings.json`). They reference `$SUPERSET_HOME_DIR` by env, so the
  content is identical to what the desktop writes; nothing was left pointing at the scratch home.
