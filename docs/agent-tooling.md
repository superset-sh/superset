# Agent tooling config

Commands and skills have a single source of truth. Each agent CLI then discovers only the paths it
supports, so the per-tool notes below describe current behavior rather than a guarantee that every
tool sees everything.

- Commands: `.agents/commands/`
- Skills: `.agents/skills/`

Everything else links to those:

| Path | Target |
| --- | --- |
| `.claude/commands` | `../.agents/commands` |
| `.claude/skills` | `../.agents/skills` |
| `.cursor/commands` | `../.agents/commands` |
| `.codex/commands`, `.codex/prompts` | `../.agents/commands` |

## Per-tool notes

- **Codex** layers trusted repo settings from `.codex/config.toml`; launch it normally from the repo
  instead of replacing `CODEX_HOME`. It discovers `.agents/skills/` automatically; invoke one
  explicitly with `$<skill-name>`.
- **OpenCode** uses `opencode.json`.
- **Mistral Vibe** reads `AGENTS.md` + `.agents/skills/` natively (trust via `--trust`; no
  `.agents/commands` support). Configure via `.vibe/config.toml`; MCP servers are `[[mcp_servers]]`
  TOML entries.
- **Kimi Code** reads `AGENTS.md` + `.agents/skills/` natively but not `.agents/commands`; configure
  through `~/.kimi-code/config.toml` or `KIMI_CODE_HOME`.
- **Grok Build** reads `AGENTS.md` per directory plus Claude Code files (`CLAUDE.md`,
  `.claude/rules/`). It does not discover project-local `.agents/commands` (only user-level
  `~/.agents/commands/`); configure through `~/.grok/config.toml`.

Agents other than Claude Code should read the relevant `.agents/skills/*/SKILL.md` when its
description matches the task.

## UFO

Install with `curl -fsSL https://ufo.ai/ufo | sh` and complete `ufo login` in a
terminal. Add the UFO preset in Settings → Agents. Launches run in the local
workspace with a positional prompt; resume uses `ufo --resume <conversation-id>`.
The wrapper reports launch identity, but UFO has no verified native lifecycle
hooks for turn completion or permission notifications. Automatic session-ID
discovery, usage history, model presets, and unattended one-shot runs are not
integrated. These command forms were checked against UFO v0.1.90's `--help`.

## Provider accounts (multi-login)

The Usage tab can hold several Claude Code / Codex logins and pick which one agents use. A login
is just a config dir the CLI is pointed at — `CLAUDE_CONFIG_DIR` / `CODEX_HOME`, injected at PTY
and agent launch by `packages/host-service/src/trpc/router/usage/default-account.ts`, which also
publishes the selection to `$SUPERSET_HOME_DIR/state/default-*` pointer files. The agent wrappers
re-read those at every launch (`buildDefaultAccountResolver` in agent-setup), so a switch reaches
existing terminals the next time the agent starts; a value the user exported by hand always wins.
Superset never touches the credential stores; the provider CLIs own every login end to end.

Because those CLIs read *everything* from their active config dir, a second dir would otherwise
mean a second, empty setup. `packages/agent-setup/src/provider-profiles.ts` provisions each
non-default profile from the default account (`~/.claude`, `~/.codex`):

- Capability directories (`skills/`, `plugins/`, `agents/`, `commands/`, `output-styles/`;
  `prompts/` for Codex) are **symlinked** at the default account's, so anything installed later is
  shared with no sync step.
- Files (`CLAUDE.md`, `config.toml`, `AGENTS.md`) are **copied**, and `settings.json` /
  `.claude.json` are **key-merged** — the CLIs rename-replace files, which would silently break a
  file symlink.
- Copies and merged keys are recorded in `<profile>/.superset-profile.json`, so anything the user
  changes inside a profile is never overwritten by a later provision.
- Claude session state (`projects/`, `sessions/`, `history.jsonl`, …) is shared too — by symlink,
  which is safe there because transcripts are append-only — so every account sees one
  conversation history and `--resume` list
  (`packages/host-service/src/trpc/router/usage/session-share.ts`; existing trees are merged in,
  live sessions included).
- Per-account and never shared: credentials, `oauthAccount`/`userID` identity and per-project
  state in `.claude.json`, auth-related settings keys, and Superset's own lifecycle hooks
  (written per profile).

Provisioning is idempotent and runs when an account is added, when one is selected, and at host
boot for the selected accounts (`usage/account-provisioning.ts`).

## Discovering Superset CLI commands

Agent-facing text (`AGENTS.md`, skills, prompts) should point agents at `superset schema` to learn
what commands and options exist, not at `--help` text. It prints every command, option and argument
as JSON, so an agent reads exact names and types with `jq` instead of parsing help text. Keep
`--help` for text a human reads.

```bash
superset schema | jq -c '[.commands[] | recurse(.commands[]?) | .path]'
superset schema | jq '.commands[] | select(.path==["terminals"]) | .commands[] | {path, options: [.options[].name]}'
```

Each command carries `path`, `description`, `options`, `args` and nested `commands`; the top level
also has `globalOptions`. The whole document is about 100 KB, so always filter it. For a command that
exists only in this worktree, read the from-source CLI with
`bun run --cwd packages/cli dev schema 2>/dev/null | jq ...`; it can list commands the installed
CLI does not have yet.

`superset sessions` (`create`, `list`, `read`, `send`, `close`, `resume`, `open`) is the chat-only
namespace targeting `sessions.*` on the host. The host accepts only supported chat providers, with
no fallback to `agents.run` or `terminal.*`; `superset agents` and
`superset terminals` remain unchanged for terminal-backed agent runs.

`superset schema` exists from CLI 1.34.0, and the probes need `jq`. Skills ship with the plugin, not
with the CLI, so a skill cannot assume either. For a bare "does this command exist" check, use the
exit code of `--help` instead; it works on every CLI version, needs no `jq`, and prints nothing:

```bash
superset feedback --help >/dev/null 2>&1 && echo supported
```

When a skill wants the schema's output and must still work on an older CLI, pipe through `jq -e`
and fall back to `--help`. `-e` matters: without it, `jq` exits 0 on the empty input an old CLI
produces, and the fallback never runs.

```bash
superset schema 2>/dev/null | jq -re '.commands[] | select(.path==["terminals"]) | .commands[].path[1]' || superset terminals --help
```

## ACP chat sessions

Use `superset sessions` for conversations, `superset agents` for the existing agent launch commands,
and `superset terminals` for PTYs. Existing commands keep their behavior.

```bash
superset sessions create --local --workspace WORKSPACE_ID --agent claude --prompt "Review the diff"
superset sessions list --local --workspace WORKSPACE_ID
superset sessions read --local --workspace WORKSPACE_ID --session CHAT_SESSION_ID
superset sessions read --local --workspace WORKSPACE_ID --session CHAT_SESSION_ID --limit 50 --before '{"epoch":"EPOCH","seq":42}'
superset sessions send --local --workspace WORKSPACE_ID --session CHAT_SESSION_ID --prompt "Continue"
superset sessions open --local --workspace WORKSPACE_ID --session CHAT_SESSION_ID
superset sessions close --local --workspace WORKSPACE_ID --session CHAT_SESSION_ID
superset sessions resume --local --workspace WORKSPACE_ID --session CHAT_SESSION_ID
superset sessions import --local --workspace WORKSPACE_ID --agent claude --native-session PROVIDER_SESSION_ID
```

The host resolves the selected agent to an installed ACP harness. It does not check the `acp-chat`
rollout flag: the desktop gates the chat UI and the API gates automation dispatch. Unsupported
agents and hosts without the new router return an error; these commands never start a terminal.
Old hosts produce an update instruction instead of falling back to `agents.run`.

`sessions read --json` returns the newest page of events, in journal order, with a `nextBefore`
cursor. To read older events, pass that cursor as JSON to `--before`. `nextBefore` is `null` on the
oldest page.

A chat session ID identifies the host's journal. A provider session ID identifies the conversation
inside Claude, Codex, or another ACP agent. `sessions resume --session` accepts the former and
returns the live chat session ID, which is a new one when the chat had stopped. `sessions import
--native-session` accepts the latter, with `--agent`, and adopts that conversation into a new chat.
`sessions create` always starts a new chat. `sessions send` resumes a stopped chat first and returns
the session ID the prompt went to. `sessions list` lists Superset-saved sessions for the workspace;
native provider discovery remains available in the chat header's history menu.

Automations check the owner's `acp-chat` flag in the API, then the host's `sessions.capabilities`. Eligible runs use
`sessions.create`; unsupported agents retain terminal launches. Hosts without the sessions router
keep the previous `agents.run` chat request, but only an exact missing-procedure response triggers
that compatibility path. A launch timeout or other failure must not start a second agent.

Chat runs save their actual chat session ID, plus a terminal-compatible ID for older clients. The
API registers a cloud metadata row before linking the run; the transcript stays in the host journal.
Run links prefer the chat ID and open or focus a chat pane. Older terminal links still work.

Cloud chat launches remain Claude-only. Fresh cloud runs bind their workspace before provisioning,
carry the automation run ID through first boot, and report the session back after launch. Reporting
is scoped to that sandbox, organization, creator, and run. A failed report is kept in the launch
marker and retried on host-service restart without launching another agent. Sandbox changes reach
cloud workspaces only through a published host-service/sandbox bundle.

## Testing the CLI and skills against the dev app

The dev desktop app is local-first: it registers its host service under a
local-db organization (e.g. `a1b2c3d4-…`), which is unrelated to the org your
`superset auth login` lands in. So a plain `bun run --cwd packages/cli dev …`
authenticates as the wrong org and can't find the running dev host — host-scoped
commands (`browser`, `terminals`, …) fail with "host service isn't running".

Use the wrapper instead:

```bash
bun scripts/dev-cli.ts browser list --workspace <id> --json
bun run cli:dev -- browser open --workspace <id> --url http://localhost:3000
```

`browser open` creates a live browser pane in the background and leaves the user
in their current workspace. Pass `--show` only when you intend to bring the browser
to the user’s attention by switching to its workspace. `--target new-tab` controls
where the pane is created; it does not imply `--show`. Pass `--activate` to make
the new pane the active one in its workspace without switching workspaces: the
user sees it at once if they are on that workspace, and finds it in front when
they return otherwise.

To test in-development *skills* in Claude Code, run `bun run dev:skills`: it
mirrors this worktree's `plugins/superset` into `~/.claude/skills/superset-dev`
(a renamed copy so it doesn't collide with the installed prod `superset` plugin),
exposing them as `/superset-dev:<skill>`. Re-run after editing a skill, then
`/reload-plugins`. In production the skills ship inside the real `superset`
plugin, so there's no collision — this is dev-only.

`bun scripts/dev-cli.ts` finds the live host manifest under `<worktree>/superset-dev-data/host/*`,
then runs the dev CLI with `SUPERSET_HOME_DIR` (the dev data dir),
`SUPERSET_ORGANIZATION_ID` (the live host's org), and a placeholder
`SUPERSET_API_KEY` (local host commands use the manifest token, not this). Start
`bun run dev:desktop` and open a workspace first, or the wrapper reports no live
host. `SUPERSET_ORGANIZATION_ID` is a general CLI override (mirrors
`SUPERSET_API_KEY`), not dev-only.

The whole dev stack binds fixed ports off `SUPERSET_PORT_BASE=3960`, so only one
`dev:desktop` (or `dev`) stack runs at a time across all worktrees. A `predev`
preflight (`scripts/check-dev-ports.ts`) runs automatically: it frees ports left
by a crashed stack in *this* worktree, and if another worktree/process holds
them it aborts with the offending pids instead of the cryptic
`Address already in use` crash. To run a second worktree's stack, stop the first.

## MCP

There is currently no committed repo-level MCP config. MCP servers are configured per tool by the
developer. If a shared set is reintroduced, put it in `.mcp.json` and have `.cursor/mcp.json` link
to it.
