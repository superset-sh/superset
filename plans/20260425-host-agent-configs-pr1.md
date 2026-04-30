# PR 1 Plan: Host Agent Configs

## Summary

This PR introduces the V2 agent configuration model used by host runtimes. Agent configs are stored in the active host runtime database (`host.db`) and edited through a new V2 Agents settings UI.

**Scope of this PR:** the data model, the host-service tRPC router, and the V2 settings page. Nothing else. The V2 new workspace modal and pending-page launch dispatch continue reading the legacy desktop presets — moving those onto host configs is **PR 5** ("Migrate Interactive Create UI" in `20260425-canonical-workspace-create-flow.md`). Splitting the scope this way keeps the data model PR small and avoids conflating it with the workspace-create rewrite.

The eventual product rule (delivered in PR 4 + PR 5) is that the UI sends only an `agentId` when creating a workspace, and the host resolves that `agentId` locally before launching. This PR ships the storage and editing surface that contract will rely on.

This PR does not migrate legacy desktop agent preset customizations into host configs. That migration should be handled later by the existing v1-to-v2 migration flow.

## Data Model

Use an argv-array launch spec, matching the dominant pattern in data-driven launchers (VS Code `ITerminalProfile`, Tabby `Shell`, WezTerm `SpawnCommand`, Zellij panes). Storing argv directly avoids shell-quoting bugs and makes prompt injection a list push instead of string concatenation.

```ts
type HostAgentConfig = {
  id: string;
  presetId: string;
  label: string;
  order: number;

  // Process spec
  command: string;          // executable, e.g. "codex"
  args: string[];           // argv that's always present

  // Prompt injection
  promptTransport: "argv" | "stdin";
  promptArgs: string[];     // argv inserted ONLY when launching with a prompt; placed between `args` and the prompt itself

  // Environment overlay
  env: Record<string, string>;
};

type AgentPreset = Omit<HostAgentConfig, "id" | "order">;
```

Launch resolution is mechanical:

```ts
const argv = prompt
  ? [command, ...args, ...promptArgs, ...(promptTransport === "argv" ? [prompt] : [])]
  : [command, ...args];
// when promptTransport === "stdin" and prompt is present, pipe `prompt` to the spawned process's stdin.
```

Hardcoded presets are add templates only. Adding a preset copies its fields into a new `HostAgentConfig` with a fresh `id` and next `order`.

The settings UI presents `command` + `args` as a single shell-style text input. Parse on save with `shell-quote` and split into `command` (= tokens[0]) and `args` (= rest); render back as `${command} ${args.map(quote).join(" ")}` for editing. `promptArgs` is a separate small input (typically empty; non-empty for codex/opencode/copilot-style agents that need a prompt-mode-only flag). `promptTransport` is a toggle. `env` is an optional collapsible key/value editor.

Examples for the bundled presets:

| Agent | command | args | promptArgs | transport |
|---|---|---|---|---|
| claude | `claude` | `["--permission-mode", "acceptEdits"]` | `[]` | argv |
| amp | `amp` | `[]` | `[]` | stdin |
| codex | `codex` | `["-c", "model_reasoning_effort=high", "-c", "model_reasoning_summary=detailed", "-c", "model_supports_reasoning_summaries=true", "--full-auto"]` | `["--"]` | argv |
| gemini | `gemini` | `["--approval-mode=auto_edit"]` | `[]` | argv |
| opencode | `opencode` | `[]` | `["--prompt"]` | argv |
| pi | `pi` | `[]` | `[]` | argv |
| copilot | `copilot` | `["--allow-tool=write"]` | `["-i"]` | argv |
| cursor-agent | `cursor-agent` | `[]` | `[]` | argv |

Empty launches drop `promptArgs` automatically, so codex doesn't get a stray `--`, opencode doesn't get a stray `--prompt`, and copilot's `-i` only appears in prompt mode. No per-preset special-casing required.

Do not include these concepts in the V2 model:

- `enabled`: remove a config instead.
- `pinned`: ordering is explicit.
- `description`: not needed in this UI.
- `iconId` / `iconUrl`: icons are derived from `presetId`.
- `promptCommandSuffix` / post-prompt shell chaining: shell-language feature; agents that need it (mastracode-style `; mastracode`) should change their CLI rather than have this layer model shell semantics.
- `cwd` override: the workspace controls cwd.
- `shell: boolean` (run via `sh -c`): adds an escaping mode and a footgun. Users who need shell features can author `sh -c '…'` explicitly via `command` + `args`.
- `taskPromptTemplate` / context templates per agent: keep centralized in `agent-prompt-template`. Per-agent overrides can be a follow-up column when there's a real need.
- `source: "user" | "team" | "builtin"`: V2 is host-scoped user data only. Layering can be added later if it lands.
- Superset Chat config: keep it out of this terminal-agent config UI for now.

## Host Service

Store V2 configs in `host.db`, not desktop `local.db`. The host service is the runtime that launches agents, so it must be able to resolve `agentId` without asking the renderer or desktop settings router.

Add a host-service settings router:

```ts
settings.agentConfigs.list()
settings.agentConfigs.add({ presetId })
settings.agentConfigs.update({ id, patch })
settings.agentConfigs.remove({ id })
settings.agentConfigs.reorder({ ids })
settings.agentConfigs.resetToDefaults()
```

Behavior:

- `list()` returns configs ordered by `order`.
- If no configs exist yet, seed from bundled built-in terminal defaults only.
- `add()` copies from hardcoded presets and allows duplicate `presetId` entries.
- `update()` can change `label`, `command`, `args`, `promptTransport`, `promptArgs`, and `env`.
- `remove()` deletes the config.
- `reorder()` persists the submitted config id order.
- `resetToDefaults()` replaces the list with bundled defaults.

Out of scope:

- Reading legacy desktop `settings.getAgentPresets()`.
- Seeding from desktop local DB overrides or custom agents.
- Migrating user customizations. The v1-to-v2 migration should own that later.

## Renderer

Under `FEATURE_FLAGS.V2_CLOUD`, the Agents settings page should use the active host service:

```ts
hostClient.settings.agentConfigs.*
```

The V2 UI shows:

- configured agents in persisted order
- add buttons from hardcoded presets
- duplicate configs as separate rows
- editable `label`, command (single text input parsed into `command` + `args`), `promptArgs`, `promptTransport` toggle, and optional `env` key/value editor
- remove and reorder controls

Non-V2 keeps the existing desktop `settings.getAgentPresets()` UI unchanged.

## New Workspace Modal

Under `FEATURE_FLAGS.V2_CLOUD`, the V2 new workspace modal reads agents from:

```ts
hostClient.settings.agentConfigs.list()
```

It must not read desktop `settings.getAgentPresets()`.

The picker displays host config instances in persisted order. The selected value is the config instance `id`, not `presetId`, so duplicate presets work.

When submitting a V2 workspace create, the pending row/create flow carries only:

```ts
agentId: selectedHostAgentConfigId
```

The renderer must not send `label`, `command`, `args`, `promptArgs`, `promptTransport`, `env`, or any other expanded agent config data in the create payload.

## Launch Flow

When the V2 pending/create flow launches an agent:

1. Resolve `agentId` against `host.db` via the host-service config API or host-side helper.
2. If `agentId` is `null` or `"none"`, do not launch an agent.
3. If `agentId` is stale or missing, fail clearly with a missing agent config error.
4. Do not fall back to desktop `settings.getAgentPresets()`.
5. Build the terminal launch argv from the resolved host config:
   - argv = `prompt ? [command, ...args, ...promptArgs, ...(promptTransport === "argv" ? [prompt] : [])] : [command, ...args]`
   - if `promptTransport === "stdin"` and a prompt is present, pipe `prompt` to the spawned process's stdin
   - apply `env` as an overlay on the workspace base env
   - carry `label` for display

This PR can keep the existing pending launch machinery. It should only swap the V2 source of agent config truth from desktop presets to host configs.

## Cloud Sandbox Fit

The model is host-runtime scoped, not desktop-specific.

For desktop, configs live in the active organization-scoped `host.db`.

For future cloud sandboxes, the same config shape can be seeded into the sandbox `host.db` from:

- the sandbox image/template, or
- the sandbox creation payload

The UI contract stays the same: ask the active host for configs, display them, and send back only `agentId`.

## Tests

Host-service tests:

- first `list()` seeds bundled defaults
- Superset Chat is not included
- `add()` copies preset fields and assigns a unique `id`
- duplicate `presetId` configs are allowed
- `update()` persists `label`, `command`, `args`, `promptTransport`, `promptArgs`, and `env`
- invalid `promptTransport` is rejected
- empty-launch resolution drops `promptArgs` (codex has no trailing `--`, opencode has no `--prompt`, copilot has no `-i`)
- prompt-launch resolution appends `promptArgs` and (for argv transport) the prompt as the last positional
- stdin transport pipes the prompt to stdin instead of pushing it to argv
- `env` overlay is merged onto the workspace base env at launch
- `remove()` deletes configs
- `reorder()` persists order
- `resetToDefaults()` replaces current configs

Renderer tests:

- V2 flag shows the new host config UI
- non-V2 flag keeps the old agent preset UI
- V2 modal queries host `settings.agentConfigs.list()`
- V2 modal submits only selected config `id`
- duplicate configs can be selected distinctly

Launch/create tests:

- V2 launch resolves `agentId` from host configs
- V2 launch never calls desktop `settings.getAgentPresets()`
- stale `agentId` fails clearly
- legacy create path remains unchanged

## Follow-Ups

- Move to the canonical `workspace.create()` endpoint.
- Add multi-agent launch arrays.
- Move attachment upload to the direct host upload flow.
- Add v1-to-v2 migration that copies legacy desktop preset/custom-agent state into host configs.
- Remove legacy desktop agent preset UI and APIs once V2 fully replaces them.
