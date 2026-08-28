# Translation glossary

Input for translators, reviewers, and the translation CI prompt. Policy
(Kiet, 2026-08-27): **product vocabulary translates — except the word
"Superset" itself, which is never translated or transliterated in any
locale.** "Workspace", "agent", "pane", "task", "automation", and the rest
are rendered in each locale's natural term, not kept as English islands.

## Never translated

These are literal identifiers, not vocabulary:

- **Superset** (brand), product names of third-party agents and tools
  (Claude, Claude Code, Codex, Gemini, Cursor, GitHub, Linear, Slack, ...)
- CLI commands and flags (`superset ws create`, `--json`), file paths,
  environment variables, code identifiers
- Keyboard keys and chords (⌘K, Ctrl+Shift+P)
- Protocol/standard names (MCP, tRPC, SSH, PR in `git`-context UI strings is
  translated per locale convention; see per-term notes below)

## Per-term guidance

| Term | Guidance |
|---|---|
| workspace | Translate with the locale's standard software term (e.g. ja: ワークスペース, zh-CN: 工作区). Must be used consistently everywhere, including onboarding and docs. |
| agent | Translate/transliterate per locale convention for AI agents (ja: エージェント, zh-CN: 智能体 or 代理 — pick one per locale and keep it). |
| pane | The locale's standard split-view/pane term. |
| pull request / PR | Follow the locale's developer convention (ja and zh commonly keep "PR"/"プルリクエスト"). |
| terminal | The locale's standard term for a terminal emulator. |
| host / host service | Translate "host" only where it reads as a common noun; "host-service" as a component name stays English. |

Add a row whenever a translation review settles a disputed term; this file
rides along in the LLM translation prompt, so rows here are enforcement, not
documentation.
