# @superset/sandbox-image

Default Docker image for Superset sandboxed workspaces (the `sandbox` key
in `.superset/config.json`).

## Local build

```bash
bun run --cwd packages/sandbox-image build:image
```

then point a project at it (machine-local config, e.g.
`.superset/config.local.json`):

```json
{
  "sandbox": {
    "enabled": true,
    "image": "superset-sandbox:dev"
  }
}
```

## Image contract

Any image used as `sandbox.image` must provide `/bin/bash`, `git`, `curl`,
CA certificates, and a `sleep` binary. The default image additionally ships
node/bun, ripgrep, jq, `openssh-client`, `procps`, and pinned agent CLIs.

### Pinned build args

Each agent CLI is pinned for reproducible rebuilds; override at build time
with `--build-arg <NAME>=<version>`:

| Build arg | Package |
| --- | --- |
| `CLAUDE_CODE_VERSION` | `@anthropic-ai/claude-code` |
| `CODEX_VERSION` | `@openai/codex` |
| `OPENCODE_VERSION` | `opencode-ai` |
| `GEMINI_CLI_VERSION` | `@google/gemini-cli` |
| `AMP_VERSION` | `@sourcegraph/amp` |
| `COPILOT_VERSION` | `@github/copilot` |
| `MASTRACODE_VERSION` | `mastracode` |

Agents without an official npm package (droid/Factory, cursor-agent, kimi,
grok, vibe, pi/omp) are not bundled — supply a custom `sandbox.image` with
them installed; their host config dirs already mount into the sandbox.

## Publishing

`.github/workflows/publish-sandbox-image.yml` builds and pushes the multi-arch
image to `ghcr.io/superset-sh/sandbox`. Pushes to `main` that touch this
package publish `:latest`; a manual `workflow_dispatch` publishes `:latest` by
default or a custom `tag` input.

`:latest` is the default `sandbox.image` for non-development hosts
(`packages/host-service/src/runtime/sandbox/docker-args.ts`). Only `:latest`
feeds that default — a manual versioned publish (e.g. `:2026-09-01`) does NOT
change the image workspaces pull unless you also point `sandbox.image` at it.

**Before the default is usable in production, the GHCR package must be public**
(Packages → sandbox → Package settings → Change visibility → Public). Hosts run
`docker pull` with no login path, so a private package fails provisioning with
"denied"/"not found". For local development none of this applies: the runtime
defaults to the locally built `superset-sandbox:dev`, so no published image is
required to dogfood.
