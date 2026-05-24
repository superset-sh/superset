# Deferred follow-ups

Improvements noticed during investigation but NOT included in any scope option:

1. **Fallow MCP server integration** — Wire fallow as an MCP tool so agents can query dead code / duplication interactively during implementation, not just at stop time. Requires `.mcp.json` entry + testing.

2. **Fallow health metrics** — Complexity scoring (cyclomatic, cognitive, CRAP score) available via `fallow health`. Useful for agent awareness but too slow for synchronous stop hooks.

3. **Per-package tsgo typecheck scripts** — The `skills-tsgo` worktree wires `tsgo --noEmit` into every package's typecheck script. This is a build-time change (human-facing) and out of scope for agent-only hooks.

4. **Codex full config** — `.codex/config.toml` with hooks, MCP servers, and permissions. This improvement only adds the minimum stop-hook config; a full Codex setup is a separate effort.

5. **Agent hook performance benchmarking** — Measure tsgo + fallow execution time on typical agent change sets (5-20 files). If >15s, consider async/parallel execution or caching.

6. **Fallow duplication detection** — AST-based clone detection (`fallow dupes`) is valuable for agents but adds ~3-5s to hook execution. Defer until performance is validated.

7. **Git pre-commit hook for tsgo** — A `.husky/pre-commit` or `lefthook.yml` entry running tsgo on changed files. This would gate human developers too — explicitly out of scope per user requirement.
