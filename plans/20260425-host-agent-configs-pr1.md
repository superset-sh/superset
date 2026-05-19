# PR 1 Plan: Host Agent Configs

## Summary

This PR introduces the V2 agent configuration model used by host runtimes. Agent configs are stored in the active host runtime database (`host.db`), edited through the V2 Agents settings UI, and selected by the V2 new workspace modal.

The key product rule is that the UI sends only an `agentId` when creating a workspace. The host owns the config and resolves that `agentId` locally before launching anything.

This PR does not migrate legacy desktop agent preset customizations into host configs. That migration should be handled later by the existing v1-to-v2 migration flow.

## Data Model

Add one shared shape for both storage and UI:

```ts
type HostAgentConfig = {
  id: string;
  presetId: string;
  label: string;
  launchCommand: string;
  promptInput: "argv" | "stdin";
  order: number;
};

type AgentPreset = {
  presetId: string;
  label: string;
  launchCommand: string;
  promptInput: "argv" | "stdin";
};
```

Hardcoded presets are add templates only. Adding a preset copies its fields into a new `HostAgentConfig` with a fresh `id` and next `order`.

Do not include these concepts in the V2 model:

- `enabled`: remove a config instead.
- `pinned`: ordering is explicit.
- `description`: not needed in this UI.
- `iconId` / `iconUrl`: icons are derived from `presetId`.
- `launchCommandSuffix`: current agents can express flags before the prompt.
- separate `command` / `promptCommand`: use one `launchCommand`.
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
- `update()` can change `label`, `launchCommand`, and `promptInput`.
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
- editable `label`, `launchCommand`, and `promptInput`
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

The renderer must not send `label`, `launchCommand`, `promptInput`, or expanded agent config data in the create payload.

## Launch Flow

When the V2 pending/create flow launches an agent:

1. Resolve `agentId` against `host.db` via the host-service config API or host-side helper.
2. If `agentId` is `null` or `"none"`, do not launch an agent.
3. If `agentId` is stale or missing, fail clearly with a missing agent config error.
4. Do not fall back to desktop `settings.getAgentPresets()`.
5. Build the terminal launch from the resolved host config:
   - `launchCommand`
   - `promptInput`
   - `label`

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
- `update()` persists `label`, `launchCommand`, and `promptInput`
- invalid `promptInput` is rejected
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
