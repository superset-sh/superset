---
source: general
improvement_id: imp-tsgo-fallow-agent-hooks
status: binding
chosen_option: moderate
loc_budget: 400
task_chunks: 1
investigator_specialist: code-reviewer
challenger_specialist: security-reviewer
---

# imp-tsgo-fallow-agent-hooks: Add tsgo, fallow, and pre-commit hooks scoped to AI coding agents

## Improvement goal

Wire three tooling improvements into the Superset monorepo, scoped exclusively to AI coding agents (Claude Code, Codex) — not human developers:

1. **tsgo** (`@typescript/native-preview`) — Fast native TypeScript typechecker for agent hook gates only
2. **Fallow** — Codebase intelligence (dead code, boundary violations) for agent stop hooks
3. **Agent-only pre-commit hooks** — Wire tsgo + fallow + Biome into Claude Stop/SubagentStop and Codex Stop

## Evidence

1. **Current hooks config** (`.claude/settings.json:26-44`): Has `SubagentStop` with `subagent-worktree-preservation.py` + `subagent-precommit-gate.py`, and `PostToolUse` matching `Task` with `subagent-evidence-verification.py`. No `Stop` hook for the root agent. No typecheck or fallow audit in any hook.

2. **Existing precommit gate** (`~/.claude/hooks/subagent-precommit-gate.py`): Detects pre-commit runners (lefthook, husky, pre-commit framework, native git hooks). Currently runs whatever pre-commit hooks are in the repo — this is NOT agent-specific.

3. **tsgo not in main**: `@typescript/native-preview` is absent from root `package.json` on main. The `skills-tsgo` worktree adds it as a devDependency (`7.0.0-dev.20260513.1`). tsgo is NOT meant for build — only for agent hook typechecking.

4. **Fallow not installed**: `which fallow` returns nothing. No `fallow` dependency in any package.json. Fallow CLI provides `fallow dead-code --format json` and `fallow audit --format json` for agent-consumable output.

5. **No Codex hooks**: The repo has no `.codex/` config for Codex agent gating.

## Target

Wire agent-only quality gates into Claude Code hooks config + Codex config. Gates run tsgo (typecheck) + fallow (dead code / boundary audit) + Biome (lint/format) on changed files ONLY. Human developers are unaffected because:
- Claude Code hooks fire ONLY in Claude Code sessions (not git, not IDE)
- Codex config is ONLY loaded by Codex CLI
- Hook scripts detect agent context and skip if not in agent mode

## Binding scope (chosen: moderate)

### Acceptance criteria

1. `@typescript/native-preview` is a devDependency in root `package.json`
2. `fallow` CLI is available (devDep or documented global install)
3. `.fallowrc.json` exists with sensible defaults (entry points, ignore patterns matching `.gitignore`)
4. `.claude/settings.json` has a `Stop` hook entry running `agent-quality-gate.py`
5. `agent-quality-gate.py` runs `tsgo --noEmit` on changed `.ts`/`.tsx` files only (not full project)
6. `agent-quality-gate.py` runs `biome check` on changed files
7. `agent-fallow-audit.py` runs `fallow dead-code --changed-since main --format json` on agent stop
8. Hook fires on Claude Stop + SubagentStop (both root agent and subagents)
9. Hook script detects agent context (CLAUDE_CODE_SESSION_ID or similar) and is a no-op if not in agent session
10. Codex config (`.codex/config.toml`) mirrors the same gates
11. Human running `git commit` is NOT affected — no git pre-commit hook changes
12. Existing hooks (subagent-precommit-gate, worktree-preservation, evidence-verification) are UNCHANGED
13. Fallow findings are advisory-only (non-blocking) in v1 — warns but doesn't block agent stop

### Files in scope

- `package.json` — Add `@typescript/native-preview` + `fallow` devDependencies
- `.claude/settings.json` — Add `Stop` hook for root agent
- `.claude/hooks/agent-quality-gate.py` — New: tsgo typecheck + Biome lint on changed files
- `.claude/hooks/agent-fallow-audit.py` — New: fallow dead-code + boundary check on changed files
- `.codex/config.toml` — New: Codex agent hooks mirroring Claude config
- `.fallowrc.json` — New: fallow config with ignore patterns

### Out of scope

- Fallow MCP server integration
- Fallow health analysis (complexity metrics)
- Fallow duplication detection (separate concern)
- Per-package typecheck script changes
- CI/CD changes
- Human-facing git pre-commit hooks

### Risks

- tsgo is a dev preview — may have bugs. Pin version; hook is non-blocking on tsgo crash.
- Fallow installation method unclear — may need global install or npx fallback.
- Fallow execution time on large codebase — mitigated by `--changed-since` flag.
- Dead code findings may be noisy initially — mitigated by advisory-only (non-blocking) status.

## Considered alternatives

- **minimum (tsgo + Biome only)**: Rejected — user explicitly requested fallow integration. Adding it later would require a separate branch+PR for one file when we can do it now cleanly.
- **strategic (full quality platform with MCP + duplication + health)**: Rejected — too much scope. MCP server, duplication hooks, and health metrics are deferred to follow-ups. The moderate option delivers 80% of the value at 57% of the LOC.

## Challenger notes

Adversarial review not yet completed by dispatched agent. Self-challenge notes:
- The `--changed-since main` approach for fallow assumes agents work on branches diverged from main. In worktrees this works; on main itself, there's no diff. Mitigation: detect if on main and skip fallow (only run tsgo + biome on staged/unstaged files).
- `.codex/config.toml` format needs verification — Codex CLI hook config may differ from Claude's. Verify before implementing.
- Hook scripts should fail OPEN (allow agent to stop) if tsgo or fallow binaries are missing, not crash the agent shutdown.

## Scope amendments

(none yet)

## Deferred follow-ups

See `.spec/improvements/imp-tsgo-fallow-agent-hooks/follow-ups.md` (7 items including fallow MCP, health metrics, per-package tsgo, full Codex config, performance benchmarking, duplication detection, git pre-commit for humans).
