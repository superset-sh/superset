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

`packages/chat-legacy` discovers slash commands from `.claude/commands`.

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

## MCP

There is currently no committed repo-level MCP config. MCP servers are configured per tool by the
developer. If a shared set is reintroduced, put it in `.mcp.json` and have `.cursor/mcp.json` link
to it.
