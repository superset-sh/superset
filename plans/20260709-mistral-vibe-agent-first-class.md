# Mistral Vibe first-class terminal agent

## Why

Superset ships first-class support for Claude, Codex, Cursor, OpenCode, Gemini, Amp, Copilot, and others, but not **Mistral Vibe** (`vibe`), Mistral's Python CLI coding agent. "First-class" here means what every built-in agent gets: appears in every agent picker with its own icon, launches into a PTY pane with a seeded prompt, exposes a model picker, and drives the working-state indicator + completion chime.

Goal: register `vibe` as a built-in terminal agent with full launch, model-selection, and lifecycle-hook integration, matching the depth of the Claude/Codex integrations.

Decisions (confirmed with the requester):
- **Integration model:** terminal agent (PTY/TUI), like every other built-in. *Not* the `vibe-acp` ACP runtime (Superset has no ACP client today; large separate subsystem).
- **Lifecycle:** full hooks (working indicator + completion chime).
- **Model picker:** yes — env-based (Vibe has no `--model` flag; model rides `VIBE_ACTIVE_MODEL`).
- **Approvals:** auto-approve in isolated worktrees (`vibe --trust --auto-approve`), mirroring Claude's `--dangerously-skip-permissions`.

**No changes to Mistral Vibe are required.** Two optional Vibe enhancements that would improve fidelity are listed under "Upstream Vibe follow-ups (not in this work)".

## Background: how the two systems fit

**Superset** derives almost everything about an agent from one array: `BUILTIN_TERMINAL_AGENTS` in `packages/shared/src/builtin-terminal-agents.ts`. Adding a manifest entry auto-propagates the `AgentType` union, labels/descriptions/commands, `BUILTIN_AGENT_IDS`, `STARTABLE_AGENT_TYPES`, `HOST_AGENT_PRESETS` (DB seed + "Add agent" install picker), the host-service `z.enum` wire schemas, and every data-driven picker in desktop + web. A terminal agent is launched by spawning the user's login shell and "typing" the `command` string; a prompt is appended as a quoted positional (`promptTransport: "argv"`, the default) or delivered via stdin heredoc. There is no headless path for terminal agents — non-interactive == prompt injection. Agent ids are stored as free text (no DB enum), so **no migration is needed**.

The non-derived, hand-maintained lists a new agent must also touch: icon SVGs (`packages/ui/.../preset-icons`), the optional model/effort catalogs (`agent-models.ts`), the desktop lifecycle-hook pipeline (`agent-setup/*` + `map-event-type.ts`), and soft surfaces (settings search, default-preset ordering, marketing/docs).

**Mistral Vibe** (`vibe`, Python; also ships `vibe-acp`):
- Interactive launch: `vibe "<task>"` — the positional prompt **auto-submits** into the TUI (`vibe/cli/textual_ui/app.py: _process_initial_prompt → _handle_user_message`). `--trust` is required for Vibe to load the worktree's `AGENTS.md` + `.agents/skills/`; `--auto-approve` (`--yolo`) bypasses tool approvals (also honored in the TUI via `force_bypass_tool_permissions`).
- Auth: `MISTRAL_API_KEY` env / `~/.vibe/.env` / OS keyring / `vibe --setup`. **No `--api-key` flag.**
- Model: config `active_model`, overridable by `VIBE_ACTIVE_MODEL` (env prefix `VIBE_`). **No `--model` flag.** Built-in aliases: `mistral-medium-3.5` (default), `devstral-small`, `local` (llama.cpp).
- Instructions: `AGENTS.md` only (no CLAUDE.md). Skills: `.agents/skills/`, `.vibe/skills/`, `~/.vibe/skills/`, `~/.agents/skills/`. Superset already ships root `AGENTS.md` + `.agents/skills/`, which Vibe reads natively once the folder is trusted — **no new committed symlinks needed**.
- Hooks: TOML `[[hooks]]` (`vibe/core/hooks/`), gated by config `enable_experimental_hooks` (env `VIBE_ENABLE_EXPERIMENTAL_HOOKS=true`). Three types: `before_tool`, `after_tool`, `post_agent_turn`. `post_agent_turn` fires **once when the agent goes idle** (`agent_loop/_loop.py:1215`, only when `should_break_loop`), so it maps cleanly to a single "done"/chime; `before_tool` fires before each tool call → "working". Each hook `command` receives an invocation JSON on stdin and can just POST to Superset's notify endpoint.

## Agent identity

- **id:** `vibe` — deliberately not `mistral` (that id already exists as an LLM *provider* in the chat model-picker; reusing it would conflate the terminal agent with the chat provider).
- **label:** `Mistral Vibe`
- **command:** `vibe --trust --auto-approve` (seeded prompt appended as the default positional arg → auto-submits into the TUI).

## Scope

### Phase 1 — Registry & launch (everything derived)
- `packages/shared/src/builtin-terminal-agents.ts`: add
  ```ts
  createBuiltinTerminalAgent({
    id: "vibe",
    label: "Mistral Vibe",
    description: "Mistral's coding agent for reading, editing, and running code from the terminal.",
    command: "vibe --trust --auto-approve",
    includeInDefaultTerminalPresets: true,
  }),
  ```
  Rely on the default `promptTransport: "argv"` (no `promptCommand` needed) — the positional prompt is what Vibe auto-submits.

**Verification:** `vibe` appears in the desktop AgentSelect / automations AgentPicker / web presets bar; `agents.run` accepts `agent: "vibe"`; launching an empty pane runs `vibe --trust --auto-approve`; launching with a prompt runs `vibe --trust --auto-approve '<prompt>'` and the TUI starts working.

### Phase 2 — Icon
- Add `vibe.svg` + `vibe-white.svg` to `packages/ui/src/assets/icons/preset-icons/` (official Mistral mark supplied by requester; commit a placeholder monogram meanwhile so the build stays green).
- Wire `packages/ui/src/assets/icons/preset-icons/index.ts`: import both, add `PRESET_ICONS.vibe = { light, dark }`, re-export. **Map key must equal the id `vibe`** or the icon silently falls back to a glyph.
- `apps/desktop/.../AgentIconPicker/agent-icon-options.ts`: add `{ id: "vibe", label: "Mistral Vibe" }` for custom-agent parity.

### Phase 3 — Env-based model picker (new shared plumbing)
Vibe has no `--model` flag, so the existing argv path (`buildAgentModelArgs`) can't carry the model. Extend the model layer to support env delivery:
- `packages/shared/src/agent-models.ts`:
  - Add optional `modelEnv?: string` to `AgentModelSupport`.
  - Add the `vibe` entry: `{ presetId: "vibe", modelFlag: null, modelEnv: "VIBE_ACTIVE_MODEL", models: [{ id: "mistral-medium-3.5", label: "Mistral Medium 3.5" }, { id: "devstral-small", label: "Devstral Small" }] }`.
  - Add `buildAgentModelEnv(presetId, model): Record<string, string>` — returns `{ [modelEnv]: model }` only when the preset declares `modelEnv` and `model` is in the curated list; otherwise `{}` (same degrade-to-default contract as `buildAgentModelArgs`, which continues to return `[]` for `vibe` since `modelFlag` is null).
- `packages/host-service/src/trpc/router/agents/agents.ts` `runTerminalAgent`: merge model env into the overlay —
  `envOverlayPrefix({ ...config.env, ...buildAgentModelEnv(config.presetId, input.model) })`.
  The renderer picker is already data-driven off `AGENT_MODEL_SUPPORT`, so no UI change; the selected model flows through the existing `agents.run` `model` input.

**Caveat (document in code + docs):** the dropdown lists Vibe's built-in aliases. A user with a custom `~/.vibe/config.toml` may define different aliases; Vibe warns and falls back if `VIBE_ACTIVE_MODEL` names an unknown alias.

### Phase 4 — Lifecycle hooks (working indicator + completion chime)
- New `apps/desktop/src/main/lib/agent-setup/agent-wrappers-vibe.ts`:
  - `createVibeWrapper()` — PATH-shadow wrapper (managed binary) that exports `SUPERSET_AGENT_ID=vibe` and `VIBE_ENABLE_EXPERIMENTAL_HOOKS=true`, then `exec`s the real `vibe`. Model it on `createOpenCodeWrapper` (plain `export … ; exec "$REAL_BIN" "$@"`, `agent-wrappers-claude-codex-opencode.ts:501`), **not** `createCodexWrapper` — the codex wrapper pulls in a session-log watcher template Vibe doesn't need.
  - `createVibeHooksToml()` — merge-by-name, marker-guarded, into `~/.vibe/hooks.toml`: two `[[hooks]]` entries (`type = "before_tool"` and `type = "post_agent_turn"`) whose `command` invokes Superset's shared notify script. Merge (don't overwrite) to preserve any user hooks.
    - **New plumbing / dependency:** every existing hook-file creator uses `JSON.parse`/`JSON.stringify` (claude `settings.json`, codex/mastra `hooks.json`) and there is **no TOML library in the repo today**. A "merge, don't overwrite" writer for `~/.vibe/hooks.toml` needs either a small TOML parse+serialize dep (e.g. `smol-toml`) or a minimal hand-rolled `[[hooks]]` writer. This is the one non-trivial unaccounted cost — the implementation plan must pick one.
  - **No notify-template change needed:** the shared notify hook template already extracts `hook_event_name` from the stdin JSON, and Vibe's hook invocation JSON carries exactly `"hook_event_name": "before_tool" | "post_agent_turn"`. So the Vibe hook `command` just pipes to the existing notify script.
- Register the new agent in the desktop setup pipeline:
  - `desktop-agent-capabilities.ts`: add action slugs (`vibe-wrapper`, `vibe-hooks-toml`) to `DESKTOP_AGENT_SETUP_ACTIONS`, and a `DESKTOP_AGENT_SETUP_TARGETS` entry `{ id: "vibe", setupActions: ["vibe-hooks-toml", "vibe-wrapper"], managedBinary: true }`.
  - `desktop-agent-setup.ts`: map the new slugs to their creators in `DESKTOP_AGENT_SETUP_RUNNERS` (compile-enforced against the actions union).
  - `agent-wrappers.ts`: barrel-export the new creators.
- `packages/host-service/src/events/map-event-type.ts`: map Vibe's event names → canonical types: `before_tool → Start`, `post_agent_turn → Stop`. (Unmapped names are silently ignored, so this is required for the chime/indicator.)

**Wrapper is load-bearing for hooks:** unlike claude/codex (whose global `settings.json`/`hooks.json` enable hooks even outside the wrapper), Vibe's hooks only fire when it's launched through the managed wrapper — that's what sets `VIBE_ENABLE_EXPERIMENTAL_HOOKS=true`. This is fine because `vibe` is a managed binary always shadowed on PATH in Superset terminals. (Alternative: also set `enable_experimental_hooks = true` in `~/.vibe/config.toml`, but that adds a second TOML-merge surface; prefer the env var in the wrapper.)

**Known coarseness (acceptable for v1):** no hook fires between prompt-submit and the first tool call, so the working indicator lights on first tool use, not immediately. With `--auto-approve` there are no permission prompts to surface.

**Verification:** launch Vibe on a task → working indicator turns on at first tool call, completion chime fires once when the agent returns to idle (`post_agent_turn`), indicator clears.

### Phase 5 — Polish / completeness
- `apps/desktop/.../useDefaultV2TerminalPresets/default-v2-terminal-presets.ts`: add `"vibe"` to `DEFAULT_V2_TERMINAL_PRESET_IDS` (seeds it as a default terminal tab; array position = tab order). Note this list and the registry's `includeInDefaultTerminalPresets` flag are independent (they already diverge for other agents) — add `vibe` to both to make it a default in v1 and v2 paths.
- `apps/desktop/.../settings-search/settings-search.ts`: add `vibe` / `mistral` keywords so Settings search surfaces it.
- Root `AGENTS.md`: extend the agent-compatibility notes (rules #3/#4) — Vibe reads `AGENTS.md` + `.agents/skills/` (no `.agents/commands`), config is TOML at `.vibe/config.toml`, MCP is `[[mcp_servers]]` TOML.
- Marketing/docs surfaces (trimmable, can be a follow-up PR): `UniversalCompatibilityDemo.tsx`, `AppMockup/constants.ts` + `apps/marketing/public/app-icons/vibe.svg`, `apps/docs/.../mcp.mdx` + `terminal-presets.mdx`, `apps/mobile/store.config.json` keywords.

## Out of scope

- **ACP runtime** (`vibe-acp`) — a structured, bidirectional integration; a large new subsystem (Superset's structured runtime is mastracode-only). Future.
- **MCP wiring** — Vibe reads TOML `[[mcp_servers]]` from `.vibe/config.toml`, not `.mcp.json`; Superset's `.mcp.json` doesn't exist in-repo yet and its setup step is a no-op. Add a `.mcp.json → .vibe/config.toml` converter only if/when Superset ships `.mcp.json`.
- **Auth management** — like all terminal agents, Vibe self-authenticates (`MISTRAL_API_KEY` / `vibe --setup`). No Superset auth code. (Prerequisite: the user must have `MISTRAL_API_KEY` set or have run `vibe` setup; document in `mcp.mdx`/onboarding notes.)
- **Reasoning-effort picker** — Vibe has no effort flag (reasoning is model-intrinsic); no `AGENT_EFFORT_SUPPORT` entry.
- **Auto-seeding Vibe into already-provisioned hosts** — new preset appears in the "Add agent" picker (derived from `HOST_AGENT_PRESETS`); an optional migration to upsert it into existing `hostAgentConfigs` tables can be a follow-up.

## Upstream Vibe follow-ups (not in this work — describe only)

1. A **turn-start / prompt-submitted hook** so the working indicator can light immediately on prompt submit instead of on first tool call.
2. A **permission-requested hook/event** so Superset could surface approval notifications if an approvals-on mode is ever added (not needed while defaulting to `--auto-approve`).

## Tests

Existing suites to extend (they use representative examples and derive from `SUPERSET_MANAGED_BINARIES`, so nothing breaks automatically — but new coverage is expected):
- `agent-models` — unit-test `buildAgentModelEnv` (valid model → `{ VIBE_ACTIVE_MODEL: <id> }`; unknown/absent model → `{}`; non-`vibe` preset → `{}`) and that `buildAgentModelArgs("vibe", …)` still returns `[]`.
- `agents.ts` (`runTerminalAgent`) — assert the env overlay includes `VIBE_ACTIVE_MODEL` when a model is selected for `vibe`, and omits it otherwise.
- `agent-wrappers.test.ts` — the new `createVibeWrapper` (exports `SUPERSET_AGENT_ID=vibe` + `VIBE_ENABLE_EXPERIMENTAL_HOOKS=true`, execs real binary) and `createVibeHooksToml` (produces valid TOML with the two `[[hooks]]`, merges rather than clobbers an existing file).
- `map-event-type.test.ts` — `before_tool → Start`, `post_agent_turn → Stop`.

## Smoke test

1. Ensure `vibe` is installed and `MISTRAL_API_KEY` is set (or `vibe --setup` has run).
2. New workspace → agent picker shows **Mistral Vibe** with its icon; select it, pick a model (Mistral Medium 3.5 / Devstral Small).
3. Launch with a task prompt → pane runs `VIBE_ACTIVE_MODEL=<model> vibe --trust --auto-approve '<prompt>'`; the TUI starts working on the prompt.
4. Working indicator turns on (first tool call); completion chime fires once when the agent finishes; indicator clears.
5. Confirm Vibe picks up the repo's `AGENTS.md` and `.agents/skills/` (trust granted via `--trust`).
6. Move `vibe` off PATH → launching shows the standard "not found in PATH, install it" wrapper message (no crash).
