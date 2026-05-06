# Plan: Remote `superset hosts update <id>`

## Context

Today, updating a remote host means physically driving to it and running `superset stop && superset update && superset auth login && superset start`. The user is increasingly running long-lived agent sessions against home machines they aren't sitting next to. Every CLI release that fixes a bug they're hitting becomes "yeah I'll fix it next time I'm home."

We already have most of the pieces in place to fix this:

- The host service (`packages/host-service`) maintains a persistent WebSocket to the relay (`packages/host-service/src/tunnel/`) so the cloud can already send tRPC requests *into* the host. That's how `apps/web` talks to `superset start`-ed daemons today.
- `superset update` (`packages/cli/src/commands/update/command.ts`) downloads a tarball from a rolling GH release, atomically renames the install root, and exits. The atomic-rename works fine while the old binary is loaded — Unix lets the running process keep its mmap'd inode.
- Auth lives in `~/.superset/config.json` (`packages/cli/src/lib/config.ts`). It already persists across daemon restarts, and #4069 added refresh-token rotation, so a restart picks up where it left off without prompting.

So the missing piece is purely orchestration: receive an "update" instruction from the cloud, swap the binary, and respawn — without requiring user input on the box.

## Approach

### 1. Host-service tRPC: `host.update.start` mutation

Add to `packages/host-service/src/trpc/router/host/host.ts` (alongside `info`):

```ts
host: router({
  info: ...,
  update: router({
    start: protectedProcedure
      .input(z.object({
        targetVersion: z.string().optional(),  // pinned semver, else rolling latest
      }))
      .mutation(async ({ ctx, input }) => {
        return startUpdate(ctx, input);
      }),
    status: protectedProcedure.query(...) // optional; mostly for polling
  })
})
```

The cloud's tRPC server (`packages/trpc/src/router/host/...`) gets a thin proxy — `host.update.start` on the cloud forwards to `host.update.start` on the named host through the existing tunnel, so authorization rides on the same JWT path as `host.info` does today.

### 2. Update orchestration via a detached supervisor

The daemon itself can't be the agent that respawns the daemon, because as soon as it dies, nothing's left holding the line. We need a supervisor process the daemon spawns and detaches from before exiting.

New binary: `superset-host-supervisor` (sibling of `superset-host` in `bin/`). It's a tiny standalone Bun script — not a long-lived daemon, just one supervised state machine that runs once and exits. Roughly:

```ts
// supervisor.ts
async function main() {
  const { organizationId, oldPid, targetVersion } = readEnv();

  await waitForExit(oldPid, 15_000);   // SIGTERM was sent before us; give it time
  if (await isAlive(oldPid)) await killHard(oldPid);

  await runCliUpdate(targetVersion);   // shells out to `superset update [--version X]`

  await runCliStart(organizationId);   // shells out to `superset start --daemon`
                                       // (loads ~/.superset/config.json, refreshes JWT)

  await pingNewDaemonHealth();         // poll new manifest endpoint
  // exit 0 — done
}
```

The supervisor logs to `~/.superset/host/<orgId>/update.log` so the user (or a future `superset hosts logs --update` command) can debug failures.

### 3. Daemon side of `host.update.start`

```ts
async function startUpdate(ctx, input) {
  if (await updateLockHeld()) {
    throw new TRPCError({ code: "CONFLICT", message: "Update already in progress" });
  }
  await acquireUpdateLock();

  spawnSupervisor({
    organizationId: ctx.organizationId,
    oldPid: process.pid,
    targetVersion: input.targetVersion,
  });
  // detached, unref'd, double-forked

  // Schedule self-exit. We must *return* before exiting so the tRPC response
  // flushes back through the tunnel — otherwise the caller sees a tunnel hangup.
  setTimeout(() => process.kill(process.pid, "SIGTERM"), 1_500);

  return { startedAt: Date.now(), supervisorPid };
}
```

The lock file lives at `~/.superset/host/<orgId>/update.lock` — created with `O_EXCL`, removed by the supervisor on exit (success or failure). The new daemon checks it on startup; a stale lock older than ~5 min is auto-cleared.

### 4. Cloud-side tRPC + CLI command

Cloud router (`packages/trpc/src/router/host/update.ts`):

```ts
update: protectedProcedure
  .input(z.object({ machineId: z.string(), targetVersion: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    const hostClient = await getTunnelClient(ctx, input.machineId);
    return hostClient.host.update.start.mutate({ targetVersion: input.targetVersion });
  });
```

CLI command (`packages/cli/src/commands/hosts/update/command.ts` — new):

```
superset hosts update <machineId>           # update to latest
superset hosts update <machineId> --version 0.2.8
superset hosts update <machineId> --check   # check-only, no install
```

Calls `api.host.update.mutate({...})`, polls `host.info.query()` for the version flip, prints a tidy progress line. Same authn the existing `superset hosts list` uses — no new auth surface.

### 5. Failure modes & rollbacks

- **Download fails** → supervisor logs, exits non-zero, leaves old binary in place. Old daemon is already dead. User runs `superset start` manually to recover. The lock file gets cleaned on exit.
- **`superset update` corrupts install root** → already handled: `atomicReplace` in `packages/cli/src/commands/update/command.ts:103-120` rolls back the rename on failure.
- **New daemon won't start** (e.g. config corrupted, port collision) → supervisor logs error and exits. Cloud's `host.info.query()` keeps timing out → CLI surfaces "host did not come back online; check logs at ~/.superset/host/<orgId>/update.log". Last-resort: SSH in.
- **Network drops mid-update** → orthogonal. The supervisor doesn't depend on the cloud tunnel; it just fetches from GitHub and respawns locally.
- **Auth has actually expired and refresh token is also dead** → new daemon comes up, fails to mint JWT, doesn't connect to relay. Surfaces in the cloud as "host offline." The cloud UI prompts the user to re-auth via the new paste flow (this PR). Code is pasted into the web UI, forwarded to the daemon over the (still-working-locally) HTTP endpoint or — if the daemon never came up — via a one-shot enrollment URL the user runs via SSH.

### 6. Concurrency, idempotence, throttling

- Update lock prevents two concurrent supervisors.
- `host.update.start` is naturally idempotent at the user level: if already on `targetVersion` and `--force` is not set, the supervisor short-circuits before killing the daemon (`atomicReplace` is a no-op when source == dest version; we add an explicit guard).
- Rate limit on the cloud side: max 1 update per host per 5 min (prevents a runaway loop hammering GH releases).

## Files to add / modify

**Host service**

- `packages/host-service/src/trpc/router/host/host.ts` — add `update.start` and `update.status` procedures.
- `packages/host-service/src/runtime/update/` (new) — `lock.ts`, `spawn-supervisor.ts`.

**Supervisor**

- `packages/cli/scripts/build-supervisor.ts` (new) — bun-builds the supervisor as a sibling binary.
- `packages/cli/src/supervisor/main.ts` (new) — the supervisor entry point. Pure stdlib; reads env, kills old pid, runs `superset update`, runs `superset start --daemon`, exits.
- `packages/cli/scripts/build-dist.ts` — include `superset-host-supervisor` in the dist tarball alongside `superset` and `superset-host`.

**Cloud / tRPC**

- `packages/trpc/src/router/host/update.ts` (new) — cloud-side proxy mutation.
- `packages/trpc/src/router/host/index.ts` — wire it up.

**CLI**

- `packages/cli/src/commands/hosts/update/command.ts` (new) — the user-facing command.
- `packages/cli/src/commands/hosts/index.ts` — register it.

## Existing helpers to reuse

- `atomicReplace`, `downloadAndExtract`, `tarballUrl`, `detectTarget` (`packages/cli/src/commands/update/command.ts`) — refactor into `packages/cli/src/lib/update.ts` so both `update` command and supervisor can call them without re-shelling.
- `spawnHostService` / `readManifest` / `isProcessAlive` (`packages/cli/src/lib/host/`) — the supervisor calls `superset start --daemon` rather than reimplementing this, but if we want a more direct path, these are importable.
- `JwtApiAuthProvider` (`packages/host-service/src/providers/auth/...`) — already handles JWT refresh, used unchanged.
- Tunnel client (`packages/host-service/src/tunnel/tunnel-client.ts`) — already routes cloud → host tRPC; the new `host.update.start` rides this.

## Verification

1. **Unit-ish**: stub `superset update` and `superset start` with no-op shells, run the supervisor against a fake old daemon, assert it kills + restarts and lock is cleared.
2. **Local end-to-end**: pin two CLI dist tarballs at known versions, install the older one, register a host, run `superset hosts update <id> --version <newer>` from a *second* CLI invocation against the same machine. Verify version flips, manifest is rewritten, tunnel reconnects, no re-auth prompted.
3. **Cross-machine**: same as #2 but issue the update RPC from a different physical machine on a different network. The home host should respond to a tunnel-routed mutation.
4. **Auth carry-over**: confirm `~/.superset/config.json` is untouched after the update. `superset auth whoami` on the home machine after update returns the same user.
5. **Rate limit**: trigger two updates in quick succession; second returns `CONFLICT`.
6. **Bad version**: `--version 99.99.99` → download fails → old binary still in place → daemon comes back as old version. (Caller sees error from CLI; cloud surfaces "update failed".)
7. **Resilience to relay drop**: pull network during update; supervisor still completes locally; cloud reconnects when network returns.

## Out of scope for v1

- Auto-update on a schedule (we want explicit user trigger first).
- Remote re-auth for hosts whose refresh token has actually expired. This PR's paste flow makes that solvable (paste from any browser, code routed to the host) but it's a separate workflow with its own UI surface — track in a follow-up plan.
- Per-host pinning (organizations that want to lock a specific version cluster-wide). Easy add later by storing `pinnedVersion` on the cloud `hosts` row.
