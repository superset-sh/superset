# Superset on OpenComputer

Image + spawn helpers for running the Superset host-service inside an
[OpenComputer](https://docs.opencomputer.dev) sandbox.

## Files

- `image.ts` — declarative `Image` definition. Bakes apt deps (docker.io,
  postgresql-client, libnss3-tools, direnv), caddy, doppler CLI, bun, npm
  globals (node-gyp, neonctl), the Superset CLI, and a `superset-init.sh`
  startup script. Also clones the Superset repo (`--depth 1`) and copies the
  Caddyfile. Layers are ordered rarely-changes first, volatile last.
- `build-snapshot.ts` — pre-build the image as a named OC snapshot. Run this
  from CI on superset main commits.
- `spawn-workspace.ts` — runtime: `Sandbox.create` from the snapshot, exec
  the init script (materializes Doppler secrets, runs `bun install` if
  node_modules is missing, starts dockerd + host-service), then drive the
  Superset SDK to create project → workspace → agent session.
- `build-image.ts` — smoke test. Spawns a sandbox (from snapshot if
  `SNAPSHOT_NAME` is set, else builds on-demand) and runs binary/path checks.
  Doesn't need Doppler or the Superset SDK.

## Build the snapshot

```sh
bun install
OC_API_KEY=<oc-key> bun run build-snapshot.ts            # default name "superset-host:main"
OC_API_KEY=<oc-key> bun run build-snapshot.ts my-name    # custom name
```

The snapshot is a server-side checkpoint of the post-build sandbox state.
Subsequent spawns reference it by name and skip the build entirely.

## Smoke test

```sh
SNAPSHOT_NAME=superset-host:main \
OC_API_KEY=<oc-key> \
bun run build-image.ts
```

14/15 checks should pass. The "node_modules present" check is intentionally
absent — `bun install` runs in the init script at first sandbox boot, not at
image-build time. (The OC build SSE stream times out before the monorepo's
1100+ packages finish resolving.)

## End-to-end spawn

Requires:

- `OC_API_KEY` — OpenComputer
- `SUPERSET_API_KEY` — for the host-service to register with the relay
  non-interactively
- A Doppler service token + project + config holding the tier-2 secrets
  (NEON_API_KEY, BETTER_AUTH_SECRET, OAuth keys, ANTHROPIC_API_KEY, etc.)
- The pre-built snapshot name (from `build-snapshot.ts`)

```ts
import { spawnSupersetWorkspace } from "./spawn-workspace";

await spawnSupersetWorkspace({
  doppler: { token: "...", project: "superset", config: "dev" },
  superset: { apiKey: "sk_live_..." },
  opencomputer: { apiKey: "...", snapshot: "superset-host:main" },
  workspace: { name: "triage", branch: "triage-2026-05-01" },
  agent: { prompt: "Triage open issues and pick three to fix." },
});
```

## What the init script does (per spawn)

1. `bun install` if node_modules is missing (first boot only, ~2 min)
2. `doppler secrets download` → `${REPO_PATH}/.env`
3. `sudo dockerd --iptables=false &` (skip if already running)
4. `superset start --daemon`

After `superset start` returns, the host-service is registered with the relay
and the sandbox is ready for SDK calls.

## Image layers (cache tiers)

| Tier | Layer | Volatility |
|------|-------|------------|
| 1 | apt deps | low |
| 2 | caddy + doppler binaries | low |
| 3 | bun installer | low |
| 4 | npm globals (node-gyp, neonctl) | low |
| 5 | Superset CLI | low |
| 6 | direnv hook + PATH in .bashrc | low |
| 7 | superset-init.sh (addFile + chmod) | medium |
| 8 | git clone + Caddyfile | high (rebuilds on Superset main commits) |

`bun install` happens at runtime, not at image build, so updating Superset
main only reclones in the image — the heavy install cost is paid once per
sandbox lifetime.

## Notes on the OC base image

- Sandbox runs as `sandbox` user (UID 1000), `HOME=/home/sandbox`
- `sudo -n` is passwordless, so root operations work in `runCommands`
- Pre-installed: `claude` (CLI), `jq`, `docker` (CLI only — no daemon),
  `node`, `npm`, `git`
- NOT pre-installed: `bun`, `direnv`, `caddy`, `doppler`, `dockerd`,
  `postgresql-client`
- `addFile` runs server-side as root; followup `chmod` needs sudo if the
  consumer runs as `sandbox`
