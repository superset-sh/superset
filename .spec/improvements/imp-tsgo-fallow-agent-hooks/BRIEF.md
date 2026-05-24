---
source: general
improvement_id: imp-tsgo-fallow-agent-hooks
title: Add tsgo, fallow, and pre-commit hooks scoped to AI coding agents only
captured_at: "2026-05-21T12:00:00Z"
---

## Description

Add three tooling improvements to the Superset monorepo, scoped exclusively to AI coding agents (not human developers):

1. **tsgo** (TypeScript native preview) — Use as the typechecker for AI agent pre-commit hooks and coding agent hook gates only. NOT for the build pipeline or human-facing typecheck commands. The `tsgo` binary provides significantly faster type checking than standard `tsc`, making it viable as a real-time gate in agent workflows where speed matters.

2. **Fallow** — Codebase intelligence tool for TypeScript/JS that provides dead code analysis, duplication detection, and health analysis. Should be wired as an audit step in agent stop/subagent stop hooks to catch issues agents introduce (unused exports, dead imports, boundary violations, duplication).

3. **Pre-commit hooks for AI agents** — Wire tsgo typecheck + fallow audit + existing Biome lint into Claude Code hooks (Stop, SubagentStop) and Codex hooks so that AI coding agents are gated on code quality before they can complete their work. Human developers are NOT gated by these hooks — they are agent-only guardrails.

### Inspiration / Reference Implementations

- `/Users/justinrich/Projects/superset/.claude/worktrees/skills-hooks` — Existing hook infrastructure (subagent-worktree-preservation, subagent-precommit-gate, subagent-evidence-verification)
- `/Users/justinrich/Projects/superset/.claude/worktrees/skills-tsgo` — tsgo integration with typecheck scripts across monorepo packages

### Key Constraints

- tsgo is ONLY for agent hooks (pre-commit gates), not for build or CI
- Hooks must apply to Claude Stop, Claude SubagentStop, and Codex Stop events
- Human-facing workflows must not be affected
- Fallow docs: https://docs.fallow.tools/
