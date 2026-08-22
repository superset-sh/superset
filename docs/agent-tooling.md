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
