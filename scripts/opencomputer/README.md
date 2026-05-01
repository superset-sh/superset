# Superset on OpenComputer

Image + spawn helpers for running the Superset host-service inside an
[OpenComputer](https://docs.opencomputer.dev) sandbox.

## Files

- `image.ts` — declarative `Image` definition. Bakes apt deps, caddy, doppler
  CLI, npm globals, Claude Code, Superset CLI, the repo clone, `bun install`,
  and a `superset-init.sh` startup script. Layers are ordered rarely-changes
  to volatile so a Superset main commit only busts the final layer.
- `spawn-workspace.ts` — runtime path: `Sandbox.create` from the image, run
  the init script (materializes Doppler secrets, starts dockerd, starts
  host-service), then drive the Superset SDK to create a project + workspace
  + agent session.
- `build-image.ts` — smoke test. Builds the image and runs sanity checks
  inside a sandbox. Doesn't need the Superset SDK or Doppler.

## Smoke test the image

```sh
bun install
OC_API_KEY=<your-oc-key> bun run build-image
```

Verifies every baked binary is present and the repo is cloned + dependencies
installed. First run does a full image build (slow); subsequent runs hit the
content-hash cache and are fast.

## End-to-end spawn

Requires:

- `OC_API_KEY` — OpenComputer
- `SUPERSET_API_KEY` — for the host-service to register with the relay
- A Doppler service token + project + config containing the tier-2 secrets
  (NEON_API_KEY, BETTER_AUTH_SECRET, OAuth keys, ANTHROPIC_API_KEY, etc.)

```ts
import { spawnSupersetWorkspace } from "./spawn-workspace";

await spawnSupersetWorkspace({
  doppler: { token: "...", project: "superset", config: "dev" },
  superset: { apiKey: "sk_live_..." },
  opencomputer: { apiKey: "..." },
  workspace: { name: "triage", branch: "triage-2026-05-01" },
  agent: { prompt: "Triage open issues and pick three to fix." },
});
```

## Layer cache structure (image.ts)

| Tier | Layer | Volatility |
|------|-------|------------|
| 1 | apt deps | low |
| 2 | caddy + doppler binaries | low |
| 3 | npm globals (node-gyp, neonctl) | low |
| 4 | Superset CLI + Claude Code | low |
| 5 | direnv hook | low |
| 6 | superset-init.sh (addFile) | medium |
| 7 | git clone + bun install + Caddyfile | **high** (rebuilds on Superset main commits) |

A new Superset commit invalidates only tier 7.
