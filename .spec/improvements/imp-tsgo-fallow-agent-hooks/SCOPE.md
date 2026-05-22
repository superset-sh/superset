---
source: general
improvement_id: imp-tsgo-fallow-agent-hooks
status: proposal
---

# imp-tsgo-fallow-agent-hooks: Add tsgo, fallow, and pre-commit hooks scoped to AI coding agents

## Improvement goal

Wire three tooling improvements into the Superset monorepo, scoped exclusively to AI coding agents (Claude Code, Codex) — not human developers:

1. **tsgo** (`@typescript/native-preview`) — Fast native TypeScript typechecker for agent hook gates only
2. **Fallow** — Codebase intelligence (dead code, duplication, boundary violations) for agent stop hooks
3. **Agent-only pre-commit hooks** — Wire tsgo + fallow + Biome into Claude Stop/SubagentStop and Codex Stop

## Evidence

1. **Current hooks config** (`.claude/settings.json:26-44`): Has `SubagentStop` with `subagent-worktree-preservation.py` + `subagent-precommit-gate.py`, and `PostToolUse` matching `Task` with `subagent-evidence-verification.py`. No `Stop` hook for the root agent. No typecheck or fallow audit in any hook.

2. **Existing precommit gate** (`~/.claude/hooks/subagent-precommit-gate.py`): Detects pre-commit runners (lefthook, husky, pre-commit framework, native git hooks). Currently runs whatever pre-commit hooks are in the repo — this is NOT agent-specific; it gates subagents on whatever the repo's pre-commit config is.

3. **tsgo not in main**: `@typescript/native-preview` is absent from root `package.json` on main. The `skills-tsgo` worktree adds it as a devDependency (`7.0.0-dev.20260513.1`) and wires `tsgo --noEmit` into per-package typecheck scripts. tsgo is NOT meant for build — only for agent hook typechecking.

4. **Fallow not installed**: `which fallow` returns nothing. No `fallow` dependency in any package.json. Fallow CLI provides `fallow dead-code --format json` and `fallow audit --format json` for agent-consumable output.

5. **No Codex hooks**: The repo has no `.codex/` config for Codex agent gating.

## Target

Wire agent-only quality gates into the Claude Code hooks config + add a parallel Codex config. The gates run tsgo (typecheck) + fallow (dead code / boundary audit) + Biome (lint/format) on changed files ONLY — never on the full codebase (too slow for hooks). Human developers are unaffected because:
- Claude Code hooks fire ONLY in Claude Code sessions (not git, not IDE)
- Codex config is ONLY loaded by Codex CLI
- The hook scripts detect agent context and skip if not in agent mode

## Option A: minimum — Agent typecheck + lint gates, no fallow

**One-line**: Add tsgo + Biome as agent-only stop hooks in `.claude/settings.json` and a parallel `.codex/config.toml`.

**Files in scope**:
- `.claude/settings.json` — Add `Stop` hook for root agent typecheck + lint gate
- `.claude/hooks/agent-quality-gate.py` — New hook script: tsgo typecheck + Biome lint on changed files
- `.codex/config.toml` — New file: Codex agent hooks mirroring Claude config
- `package.json` — Add `@typescript/native-preview` devDependency

**LOC budget**: ~200 lines total

**Acceptance criteria**:
1. `@typescript/native-preview` is a devDependency in root `package.json`
2. `.claude/settings.json` has a `Stop` hook entry running `agent-quality-gate.py`
3. `agent-quality-gate.py` runs `tsgo --noEmit` on changed `.ts`/`.tsx` files only (not full project)
4. `agent-quality-gate.py` runs `biome check` on changed files
5. Hook fires on Claude Stop + SubagentStop (both root agent and subagents)
6. Hook script detects agent context (CLAUDE_CODE_SESSION_ID or similar env var) and is a no-op if not in agent session
7. Codex config mirrors the same gates
8. Human running `git commit` is NOT affected — no git pre-commit hook changes
9. Existing hooks (subagent-precommit-gate, worktree-preservation, evidence-verification) are UNCHANGED

**Out of scope**:
- Fallow integration (deferred)
- Per-package typecheck script changes
- CI/CD changes
- MCP server config for fallow

**Risks**:
- tsgo is a dev preview — may have bugs. Mitigated by pinning version and only using in hooks (non-blocking on failure is an option).
- Hook execution time: tsgo on changed files should be <10s but needs testing.

---

## Option B: moderate — minimum + fallow dead-code audit

**One-line**: Add tsgo + Biome + fallow dead-code audit as agent-only stop hooks.

**Files in scope**:
- All files from Option A
- `.claude/hooks/agent-fallow-audit.py` — New hook script: fallow dead-code + boundary check on changed files
- `package.json` — Add `fallow` devDependency (if CLI is npm-installable) OR document global install
- `.fallowrc.json` — New file: fallow config with ignore patterns matching `.gitignore` + agent-specific rules

**LOC budget**: ~400 lines total

**Acceptance criteria**:
1. All ACs from Option A
2. `fallow` CLI is available (either devDep or documented global install)
3. `.fallowrc.json` exists with sensible defaults (entry points, ignore patterns)
4. `agent-fallow-audit.py` runs `fallow dead-code --changed-since main --format json` on agent stop
5. Hook reports unused exports, dead imports, and boundary violations introduced by the agent's changes
6. Hook is non-blocking (warns but doesn't block) — fallow findings are advisory in v1

**Out of scope**:
- fallow MCP server integration
- fallow health analysis (complexity metrics)
- fallow duplication detection (separate concern)
- Per-package typecheck script changes

**Risks**:
- fallow installation method unclear — may need global install or npx fallback
- fallow execution time on large codebase — mitigated by `--changed-since` flag
- Dead code findings may be noisy initially — mitigated by advisory-only (non-blocking) status

---

## Option C: strategic — Full agent quality platform with fallow MCP + duplication

**One-line**: Full agent quality platform: tsgo + Biome + fallow (dead-code + duplication + health) with MCP server for real-time agent access.

**Files in scope**:
- All files from Option B
- `.mcp.json` — Add fallow MCP server entry
- `.claude/hooks/agent-fallow-dupes.py` — Duplication detection on changed files
- `.fallowrc.json` — Extended config with health thresholds and duplication rules
- `.agents/skills/` or `CLAUDE.md` — Documentation for agents on how to use fallow MCP tools

**LOC budget**: ~700 lines total

**Acceptance criteria**:
1. All ACs from Option B
2. Fallow MCP server is configured in `.mcp.json` — agents can use `analyze`, `find_dupes`, `check_health` tools
3. Duplication hook runs `fallow dupes --changed-since main` on agent stop
4. Health analysis available via MCP but NOT in stop hooks (too slow for synchronous gating)
5. Agent documentation explains when to use each fallow tool

**Out of scope**:
- CI integration
- Human-facing tooling changes
- Build pipeline changes

**Risks**:
- MCP server adds complexity to `.mcp.json` config
- Duplication detection may be slow on first run (AST analysis)
- Health metrics are subjective — thresholds need tuning
- Scope creep risk: this is already a lot of tooling to wire at once

## Considered alternatives

None yet (first proposal).

## Challenger notes

Awaiting challenger review.
