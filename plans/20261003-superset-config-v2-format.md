# `.superset/config.toml`: the v2 format

Status: decided. The format is `.superset/config.toml`; the implementation is `plans/done/20261022-2304-config-toml-v2.md`.

## Why

One file configures local worktrees and cloud sandboxes. The keys are named by where they run, not when, so they're hard to follow:

| Key | Local (host-service `runtime/setup/config.ts`) | Cloud (`packages/trpc/src/lib/sandbox/repo-hooks.ts`) |
|---|---|---|
| `setup` | new worktree created | environment golden image built |
| `start` | not used | every sandbox boot or resume (`runSandboxStartHook`) |
| `teardown` | workspace deleted (`workspaceCleanup.destroy`) | never runs |
| `run` | Run button | not used |
| `ports` | not read (labels come from `.superset/ports.json`) | published ports, numbers only, max 13 |
| `cwd` | working directory for hooks | honoured by the start hook |

## Problems found

1. `setup` means two different things depending on where it runs.
2. Cloud workspaces never run teardown, so external resources leak. In this repo, `setup.cloud.sh` creates a Neon branch per sandbox, and only `teardown.sh` deletes it.
3. The docs (`apps/docs/content/docs/setup-teardown-scripts.mdx:28,185`) promise teardown on delete, with no cloud caveat.
4. Local port allocation is hand-rolled per repo (`allocate_port_base` in `.superset/lib/setup/steps.sh`: lock file, block of 20, Next.js unsafe-port skips).
5. `.superset/ports.json` labels are keyed by fixed numbers, so they only match the workspace that got base 3000.
6. The cloud reads only the committed `config.json`, raw from GitHub on the branch. The overrides (`~/.superset/projects/<repoPath>/config.json`, `.superset/config.local.json` with `before`/`after`) are local only.

## Prior art

- **Cursor** `.cursor/environment.json`: `install` (once per build, then snapshotted), `start` and `terminals` (every agent start). No cleanup hook.
- **Codex Cloud**: `setup` (fresh container) and `maintenance` (cached container resumed), configured in the web UI. No cleanup hook.
- **Codex app** `.codex/`: setup per new worktree, plus "actions" with per-OS variants.
- **Conductor** `.conductor/settings.toml`: `setup`, named `run` scripts, `archive` ("before Conductor archives a workspace"). One allocated `CONDUCTOR_PORT`, local only. Personal overrides in `settings.local.toml`.
- **devcontainer**: `onCreate`, `updateContent`, `postCreate`, `postStart`, `postAttach`. No teardown script.

## Decisions

Ordered by dependency. Each decision is logged here once made.

| # | Decision | Choice | Status |
|---|---|---|---|
| 1 | File format and location | TOML, in a new file `.superset/config.toml` | decided |
| 2 | Phases | optional `install`, `setup`, `archive`, plus named `terminals` (their behaviour comes in PR 2) | decided |
| 3 | What `archive` promises | outside cleanup only; Superset stops processes and releases ports before it runs; cloud Undo recovers through `setup` | decided |
| 3a | Name of the cleanup key | `archive` in both places, because local "Delete workspace" is being renamed to "Archive" to match the cloud. v1's `teardown` maps to it | decided |
| 3b | What Undo restores | Whatever `archive` removed comes back fresh through `setup`. For this repo, unarchiving gives a new, empty Neon branch, which is acceptable | decided |
| 4 | Local vs cloud | one file; `[x.cloud]` / `[x.local]` tables merged key by key over the shared entry | decided |
| 5 | Long-running commands | `[terminals.<name>]` with `run`, `default`, `cwd`. Named `terminals`: what Superset already calls them, and Cursor's key | decided (behaviour in PR 2) |
| 6 | Ports | `[ports.<name>]` with `default`, `label`, `preview`; allocated locally, defaults in the cloud | proposed |
| 7 | Overrides | one personal file, `.superset/config.local.toml`, gitignored, read from the main checkout, merged key by key. The `~/.superset/projects/…` override and `before`/`after` are dropped | decided |
| 8 | v1 compatibility | Every v1 source keeps working when there is no `config.toml`, and each use is reported, so it can be removed once usage is low. See Legacy support | decided |
| 9 | Per-OS variants | none: 1 of about 300 repos in the survey used them. If Windows needs it later, `[setup.windows]` fits as one more override without breaking the format | decided |
| 13 | TOML library | `smol-toml` in host-service and the API: reads and writes TOML 1.1, no dependencies. `toml` only reads | decided |
| 14 | Editing the config in the app | one Settings screen that edits the whole file as text, no feature flag; replaces the three-tab Setup/Teardown/Run editor. See Config screen | decided |
| 10 | Copying files from the main checkout | no `[files]` key; a one-line `cp "$SUPERSET_ROOT_PATH/…"` in `setup` | decided |
| 11 | Lifecycle rules users read | see Lifecycle | proposed |
| 12 | Rebuilding an environment's image | incremental rebuild every day while the org has a paid plan, with no change check; manual rebuild; fresh rebuild on a new base image | decided |

The platform owns only what a script can't do well: coordination across workspaces (ports), tracking over time (processes), caching (`install`) and lifecycle events (`archive`).

## Format reference

```toml
# .superset/config.toml

[install]                          # optional; cacheable, no per-workspace state
run = ["bun install"]

[setup]                            # get this workspace ready
run = ["./.superset/setup.sh"]

[setup.cloud]                      # replaces [setup] in the cloud
run = ["./.superset/setup.cloud.sh"]

[terminals.dev]                    # long-running; Superset starts, tracks and stops it
run = "bun dev"
default = true

[terminals.dev.cloud]
run = "./.superset/dev-stack.cloud.sh"

[archive]                          # outside cleanup only
run = ["./.superset/archive.sh"]

[archive.cloud]
run = ["./.superset/archive.cloud.sh"]

[ports.web]
default = 3000
label = "Web"
preview = true

[ports.api]
default = 3001
label = "API"
```

### Tables

| Table | When it runs | Local | Cloud |
|---|---|---|---|
| `[install]` | cacheable prep | before `setup`, when the workspace is created | when the environment's base image is built |
| `[setup]` | get the workspace ready | once, when the workspace is created | on every boot and resume; must be safe to re-run |
| `[terminals.<name>]` | long-running | on demand from the Run button | `default` ones start on boot |
| `[archive]` | before the workspace is archived (the UI action is "Archive" in both places) | before the worktree is removed | at archive time, before the sandbox stops |
| `[ports.<name>]` | not a phase | a number is allocated per workspace | always `default` |

### Keys

Phases (`install`, `setup`, `archive`):

| Key | Type | Meaning |
|---|---|---|
| `run` | string or array of strings | Commands, run in order, each in its own shell. `setup` and `install` stop at the first failure; `archive` runs every command and never blocks the archive. An empty array disables the phase. |
| `cwd` | string | Working directory, relative to the workspace root. Default: the workspace root. |

Terminals (`[terminals.<name>]`):

| Key | Type | Meaning |
|---|---|---|
| `run` | string or array of strings | The command. An array runs as one chain, so the last command is the long-running one. An empty array disables the process. |
| `default` | bool, default `false` | Locally, the Run button starts every `default` terminal; the others are in its menu. In the cloud, `default` terminals start on boot. |
| `cwd` | string | As for phases. |

Ports (`[ports.<name>]`):

| Key | Type | Meaning |
|---|---|---|
| `default` | integer, required | The number used inside a sandbox, and preferred locally when free. |
| `label` | string | Shown in the ports UI. Default: the name. |
| `preview` | bool, default `false` | Cloud only: publish the port so it gets a preview URL behind the gate. Ports are published when the sandbox is created, at most 13 per repo. |

Overrides: `[<phase>.cloud]`, `[<phase>.local]`, `[terminals.<name>.cloud]` and `[terminals.<name>.local]` accept the same keys and are **merged key by key** over the shared table in that environment: a key they set replaces the shared one (arrays included), and a key they leave out is kept. To turn something off in one environment, set `run = []`.

### Names

- Process and port names match `^[a-z][a-z0-9_]*$`. `web_ui` is valid and `web-ui` is not, because the name becomes part of a variable.
- Inside a process or phase table, `cloud` and `local` are reserved for overrides. A process can still be named `cloud`: that's `[terminals.cloud]`, one level up.
- Unknown keys are an error, so a typo like `defualt` is caught.

### Variables

Every phase and process gets:

| Variable | Value |
|---|---|
| `SUPERSET_ENV` | `local` or `cloud` |
| `SUPERSET_WORKSPACE_NAME` | the workspace's name, for naming outside resources |
| `SUPERSET_ROOT_PATH` | the main checkout (local only) |
| `SUPERSET_PORT_<NAME>` | one per port, uppercased: `[ports.web]` gives `SUPERSET_PORT_WEB` |

`IS_SANDBOX=1` keeps being set in the cloud for existing scripts.

### Layers

One rule everywhere: layers merge key by key, and a value a layer sets, including an array, replaces the one below it. A table or process a layer adds is added.

1. `.superset/config.toml` from the **workspace's own checkout**, so each branch uses its own version. If the branch has none, the main checkout's.
2. Its `[x.cloud]` or `[x.local]` tables, for the current environment.
3. `.superset/config.local.toml` from the **main checkout** (`$SUPERSET_ROOT_PATH`), local only.

`config.local.toml` is gitignored, so git never puts it into a new worktree. Reading it from the main checkout is what makes one personal file apply to every worktree of the repo. Its commands still run in the workspace, and relative paths resolve against it. The cloud never reads it.

```toml
# .superset/config.local.toml

[setup]
run = ["./.superset/setup.sh", "direnv allow"]   # replaces the shared run list

[terminals.dev]
run = "bun dev --turbo"                          # only run changes; default = true stays

[terminals.storybook]                            # a process only you have
run = "bun storybook"
```

Dropped from v1, so there's one place for personal tweaks:
- `~/.superset/projects/<repo-path>/config.json` (#1266). Superset warns and points to `config.local.toml`.
- `before` / `after` (#2083). To add a step, copy the shared list and add to it.
- Reading a worktree's own `config.local.json` first. Nobody gets one automatically, and two locations make it unclear which is in effect.

## Lifecycle

The rules as users read them. The local column in Tables still applies; these rules describe the cloud unless they say otherwise.

### `[install]`

- Superset runs `install` when it builds your environment. The result (dependencies, generated code, compiled artifacts, warm caches) is saved as the environment's image, and every new workspace starts from it.
- It runs from the repository root, on the base branch, with the environment's variables. It must not depend on a workspace: no workspace name, no database, no `.env`.
- It must be idempotent, because it can run on top of the disk from a previous build.
- Superset rebuilds the environment when:
  1. you run `superset environments rebuild` or press Rebuild in Settings;
  2. every day, while your organization has a paid plan, so the image follows the base branch;
  3. Superset ships a new base image.
- A failed rebuild does not replace the current image. Workspaces keep starting from the last successful one.
- Rebuilds are not metered against your plan (billing plan D-Q2).

### `[setup]`

- In the cloud, `setup` runs every time a workspace starts: on creation, on every resume, and after you undo an archive. It must be safe to run again and again. Locally it runs once, when the workspace is created.
- Use it for per-workspace state: a database branch, `.env`, seed data.
- It finishes before any process starts and before an agent launches.

### `[terminals.<name>]`

- In the cloud, `default = true` terminals start on every boot, after `setup`. Locally, they start from the Run button.
- They run in a tmux session that the agent shares.
- Superset stops processes and releases ports before `archive` runs.

### `[archive]`

- Runs once, at archive, after processes stop and before the sandbox is deleted.
- Use it to release outside resources. A failure never blocks the archive.

### `[ports.<name>]`, overrides and unknown keys

As in Format reference. The port variable is `SUPERSET_PORT_<NAME>`.

### Branch and environment

- A workspace always starts on the current tip of its base branch, whenever the environment was built. The build only decides how much `install` has to do again.
- Superset never updates a workspace after it starts. Rebase it yourself, as you would a local branch.

## Rebuild

Design for rule 2 under `[install]`.

### No change check

The daily job rebuilds every eligible environment, changed or not. At about $0.05 per environment per day, that is simpler than storing and comparing a hash, and it needs no schema change. If the cost grows, a later change can skip unchanged environments with a hash of the resolved `[install]` and the lockfiles on the base branch.

### Two kinds of rebuild

| Kind | When | Steps |
|---|---|---|
| Incremental | the daily job, and a manual rebuild without `--fresh` | resume the golden, `git fetch --depth 1 origin <base> && git checkout -B <base> FETCH_HEAD`, run `[install]`, strip identity, stop, `waitForStopSnapshot`. This is the `promoteSandboxToEnvironment` sequence with two commands added. About 2–3 min of a 16 GB box, about $0.05. |
| Fresh | `--fresh`, and every time the base image tag moves | start from a new image box, as `packages/sandbox/src/environments/release.ts` does today for the internal environment. This limits the drift that incremental runs collect. |

### Daily job

- For each environment that has an `[install]`, of an org with an active paid plan, run an incremental rebuild.
- Skip free and lapsed orgs. Do not delete their goldens.
- The plan check uses the same gate as boot. There is no shared helper for it yet (`authorizeBoot` does not exist in the repo today); the implementation plan adds one.

### Manual rebuild

- tRPC procedure `environment.rebuild` and CLI `superset environments rebuild <name> [--fresh]`. Paid plan required.
- Refuse when the environment has no `[install]`: a golden promoted by hand has no recipe to run again.

### Environment count

- Environments per org is an Autumn feature, `environments`, non-consumable. It is checked at create and at promote.
- The numbers live in the Autumn dashboard, not in code, because the tiers are changing.

## Key review

Problems found in the draft and what changed:

1. **`run` had two types.** It was an array in phases and a string in terminals. It now accepts a string or an array everywhere.
2. **`only = "local" | "cloud"` was a second way to say what an override already says.** It's dropped: `[terminals.api.cloud]` with `run = []` turns a process off in the cloud.
3. **Names with hyphens broke the variables.** `[ports.web-ui]` would give `SUPERSET_PORT_WEB-UI`. Names are now restricted (see Names).
4. **"`default` process" was ambiguous** when more than one process has it. Every `default` process starts together.
5. **The v1 script fallback is dropped.** In v1, a missing key falls back to `.superset/<key>.sh`, by key name. That doesn't survive renaming `teardown` to `archive`, and it hides which script runs. v2 runs only what the file lists; migration writes the paths out.
6. **v1 had one top-level `cwd` for everything.** v2 sets it per table; migration copies it into each.
7. **`preview` only means something in the cloud.** Locally it's ignored.

Checked and fine:
- The reference parses with `Bun.TOML.parse` into the intended structure: overrides land as nested `cloud` tables.
- A process named `cloud` doesn't collide with an override.

## Migration guide

### What v1 did, in v2 terms

The old cloud keys (`start`, `ports`, and `setup`'s base-image meaning) are not carried over. Cloud repos write the new tables directly.

| v1 | v2 |
|---|---|
| `setup` | `[setup]` |
| `teardown` | `[archive]` |
| `run` | `[terminals.dev]` with `default = true` |
| `cwd` | `cwd` on each table |
| `.superset/<key>.sh` fallback | written out explicitly in `run` |
| `config.local.json` | `config.local.toml` in the main checkout. `before` / `after` become full `run` lists |
| `<worktree>/.superset/config.json` | `config.toml` is read from the workspace's checkout anyway |
| `~/.superset/projects/<repo-path>/config.json` | dropped: move it to `config.local.toml`; Superset warns |

### Steps for a repo

1. **Translate.** Write `.superset/config.toml` from `config.json` using the table above. Proposed: `superset config migrate` does this and prints the result for review.
2. **Delete the old files.** Remove `config.json` and `ports.json` in the same commit. If both `config.toml` and `config.json` exist, `config.toml` wins and Superset warns about the other.
3. **Tidy the translation:**
   - Collapse a `[setup]` / `[setup.cloud]` pair into one `[setup]` if they do the same thing.
   - Turn the `run = []` cloud overrides back on where the step should run in the cloud too.
   - Move dependency installs that don't depend on the workspace into `[install]` for faster cloud boots.
4. **Use the port variables.** Replace hard-coded ports and home-made port allocators with `$SUPERSET_PORT_<NAME>`. Build URLs between services from the variables too (`http://localhost:$SUPERSET_PORT_API`), so remapped and forwarded ports keep working.
5. **Shrink `archive`.** Drop anything that kills dev servers, frees ports or deletes files inside the worktree: Superset now does the first two, and the worktree is deleted anyway. Keep only outside cleanup, like `docker compose down`, dropping a database or deleting a Neon branch.
6. **Decide on cloud cleanup.** Add an `[archive.cloud]` that releases what the cloud `setup` created. It must leave the workspace recoverable, because Undo re-runs `setup`.

### Example: this repo

v1 (`.superset/config.json`):

```json
{
	"setup": ["./.superset/setup.sh"],
	"teardown": ["./.superset/teardown.sh"],
	"run": ["bun dev"],
	"start": ["./.superset/setup.cloud.sh", "./.superset/dev-stack.cloud.sh"]
}
```

Faithful translation:

```toml
[install.cloud]
run = ["./.superset/setup.sh"]

[setup]
run = ["./.superset/setup.sh"]

[setup.cloud]
run = ["./.superset/setup.cloud.sh", "./.superset/dev-stack.cloud.sh"]

[terminals.dev]
run = "bun dev"
default = true

[terminals.dev.cloud]
run = []

[archive]
run = ["./.superset/teardown.sh"]

[archive.cloud]
run = []
```

After tidying:

```toml
[install]
run = ["bun install"]

[setup]
run = ["./.superset/setup.sh"]

[setup.cloud]
run = ["./.superset/setup.cloud.sh"]

[terminals.dev]
run = "bun dev"
default = true

[terminals.dev.cloud]
run = "./.superset/dev-stack.cloud.sh"

[archive]
run = ["./.superset/archive.sh"]

[archive.cloud]
run = ["./.superset/archive.cloud.sh"]

[ports.web]
default = 3000
label = "Web"
preview = true

[ports.api]
default = 3001
label = "API"
```

What the tidying changes:

- **`[install]`** holds `bun install`, so the cloud base image caches dependencies. Today `setup.sh` runs it on every new local worktree, and `setup.cloud.sh` on every boot.
- **The dev stack** moves from `setup.cloud` into a cloud-only version of the `dev` process, so Superset tracks it and stops it on archive.
- **`archive.sh`** is `teardown.sh` without the steps Superset now handles: killing terminal daemons, freeing the port base, removing `superset-dev-data`. It keeps deleting the Neon branch.
- **`archive.cloud.sh`** only deletes the Neon branch. `setup.cloud.sh` re-creates it on Undo.
- **`[ports]`** replaces `ports.json`. The other 10 ports follow the same pattern. `setup.sh` reads `SUPERSET_PORT_*` instead of calling `allocate_port_base`.

## Legacy support

v2 documents one shared file and one personal file. Until the numbers say otherwise, the loader also keeps reading everything v1 reads:

| Legacy source | Behaviour | Reported as |
|---|---|---|
| `.superset/config.json` | read when there is no `config.toml`, mapped as in the migration guide | `config_json` |
| `config.local.json` (worktree first, then main checkout) | as in v1 | `config_local_json` |
| `before` / `after` in a local file | as in v1 | `before_after` |
| `~/.superset/projects/<repo-path>/config.json`, and the `<project-id>` key | as in v1 | `user_projects_override` |
| `.superset/<key>.sh` fallback | as in v1 | `script_fallback` |
| cloud `start` and `ports` in `config.json` | as today, when there is no `config.toml` | `cloud_start`, `cloud_ports` |

- When `config.toml` exists, it wins, and the v1 files are ignored, with a warning in the setup log if any are present.
- Reporting: one `workspace_config_resolved` event per workspace creation and per archive, not per load. It's sent through `api.analytics.captureEvent`, like `trackWorkspaceEvent` in `local-workspace-store.ts`, with `format` (`toml` or `json`), `legacy_sources` (the names above) and `organization_id`. Commands and file contents are never sent.
- Each legacy source logs a one-line deprecation hint pointing to its v2 replacement.
- Removal: a source can go once it shows up in under 1% of resolutions for 30 days, with a release note first.

## Config screen

Settings → project → **Workspace config** replaces the "Project lifecycle scripts" editor (`V2ScriptsEditor`: three autosaving tabs for setup, teardown and run, written through `config.updateConfig`).

- **The whole file, as text.** CodeMirror, already used by the file pane's `CodeEditor`, with TOML highlighting from the installed `@codemirror/legacy-modes`. It shows the file's path, so it's clear this is a committed repo file.
- **Comments are kept.** The screen saves exactly the text you typed; nothing re-serializes the file.
- **Checked as you type**, with the loader's own validation: syntax errors, unknown keys, invalid names. **Save** is explicit and disabled while the file is invalid. No autosave, so a half-typed file never reaches disk.
- **Repos with only `config.json`**: the screen shows and edits that file, with JSON highlighting and v1 validation, plus a **Convert to config.toml** button that writes the migration-guide translation for review. Nobody is forced to migrate.
- **Personal file**: a second tab for `config.local.toml` in the main checkout, labelled as gitignored and applying to every worktree.
- **host-service**: a new `config.writeConfigFile` procedure that validates again before writing. It's additive, so released clients are unaffected. `config.updateConfig` keeps working for released desktop builds and is not used by the new screen.
- The sidebar's setup card (`V2SetupScriptCard`) keeps linking here.

## Rollout

- **PR 1, format, loader and config screen:** `config.toml` with `install`, `setup`, `archive`, the `local`/`cloud` overrides, the layered loading, and every v1 source still working, with usage reporting (see Legacy support). `[terminals.*]` is parsed, but only the `default` entry drives today's Run button. `[archive.cloud]` runs at cloud archive time, which stops the Neon branch leak.
- **PR 2, terminals, ports and forwarding:** several named terminals, `[ports]` with local allocation and `SUPERSET_PORT_<NAME>`, and port forwarding. They depend on each other through "which process owns which port".

## Open questions

- Whether to ship `superset config migrate`, or document the translation only.
