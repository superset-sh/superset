---
source: ticket
improvement_id: SUPER-869
ticket_id: SUPER-869
ticket_url: https://linear.app/superset-sh/issue/SUPER-869/add-factory-droid-as-a-terminal-agent-preset
tracker: linear
title: Add Factory Droid as a terminal agent preset
labels: [Feature]
fetched_at: 2026-05-22T15:11:19Z
---

## Context

Factory Droid is already partially integrated — the desktop app manages `~/.factory/settings.json` hooks and the wrapper script in `agent-wrappers-droid.ts`, and `agent-identity.ts` recognizes `"droid"` as a valid agent ID. However, Droid is missing from the two static preset registries that feed the terminal preset picker: `HOST_AGENT_PRESETS` (host-agent-presets.ts) and `BUILTIN_TERMINAL_AGENTS` (builtin-terminal-agents.ts). Adding it as a first-class preset makes it discoverable alongside Claude, Codex, Gemini, Amp, and Copilot.

## Implementation notes

### Files

* `packages/shared/src/host-agent-presets.ts` — add `droid` entry to `HOST_AGENT_PRESETS` array
* `packages/shared/src/builtin-terminal-agents.ts` — add `droid` entry to `BUILTIN_TERMINAL_AGENTS` array
* `packages/shared/src/agent-identity.ts:16` — `agentId: BuiltinAgentId | "droid"` union will simplify to just `BuiltinAgentId` once droid joins the built-in set
* `packages/ui/src/assets/icons/preset-icons/index.ts` — add a droid icon (light + dark variants)
* `apps/desktop/src/main/lib/agent-setup/agent-wrappers-droid.ts` — existing wrapper, no changes needed

### Approach

Add a `droid` preset entry to both registries. Based on the [Factory CLI reference](https://docs.factory.ai/reference/cli-reference):

**HOST_AGENT_PRESETS entry:**

```
presetId: "droid"
label: "Droid"
description: "Factory's agent-native coding CLI for autonomous software development."
command: "droid"
args: ["--auto", "medium"]
promptTransport: "argv"
promptArgs: []
env: {}
```

The `--auto medium` flag gives Droid autonomy to create/edit files, install deps, build/test, and make local git commits — comparable to the `--dangerously-skip-permissions` / `--approval-mode=auto_edit` flags used by Claude and Gemini presets. This is the right default for a Superset terminal preset since the user expects the agent to do real work.

**BUILTIN_TERMINAL_AGENTS entry:**

```
id: "droid"
label: "Droid"
description: "Factory's agent-native coding CLI for autonomous software development."
command: "droid --auto medium"
promptCommand: "droid --auto medium"
```

Droid accepts prompts as a trailing positional argument (`droid "query"` or `droid exec "query"`), so `promptTransport: "argv"` with empty `promptArgs` is correct — the prompt gets appended directly to the command.

### Related code

Follow the same pattern as the `gemini` preset — similar args structure (`--approval-mode=auto_edit`), argv transport, and prompt passed as positional.

### Gotchas

* Droid's `--skip-permissions-unsafe` flag exists but should NOT be used as the default — it removes all guardrails. `--auto medium` is the right balance.
* Droid supports `droid exec` for headless/non-interactive mode, but for the terminal preset the interactive `droid` command is correct (same pattern as Claude and other presets that launch interactive REPLs).
* The `agent-identity.ts` type union `BuiltinAgentId | "droid"` can be collapsed once droid is in `BUILTIN_TERMINAL_AGENTS`, since `BuiltinAgentId` is derived from that array.
* A droid icon SVG will need to be added to `packages/ui/src/assets/icons/preset-icons/` (both light + dark variants).
