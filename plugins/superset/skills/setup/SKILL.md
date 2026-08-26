---
name: setup
description: Make a repository Superset-ready by authoring .superset/config.json with setup, teardown, and run scripts so every new workspace boots configured, then verifying with a real workspace. Use when the user wants to set up a project or repo for Superset, configure workspace setup scripts, or fix a failing workspace setup ("new workspaces don't have node_modules", "my .env is missing in workspaces", "setup script isn't running").
argument-hint: optional notes about the project's setup needs
allowed-tools: Bash(superset:*)
---

# Superset Project Setup

Goal: every new workspace (isolated git worktree) for this repo comes up ready, with dependencies installed, env present, and services reachable, without manual steps.

## 1. Inspect the repo

Work out what a fresh worktree needs, and ask about anything ambiguous:

- Package manager and install command (lockfiles decide: bun/pnpm/yarn/npm, cargo, uv, ...)
- Env files: `.env` is usually gitignored, so new worktrees need it copied from the main checkout or generated from `.env.example`
- Services (docker-compose, databases) and dev command + ports
- Monorepo layout (does setup need a `cwd`?)

## 2. Author `.superset/config.json`

This file is what wires lifecycle scripts in; a bare `setup.sh` without `config.json` is not picked up. Schema:

```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": ["bun dev"],
  "cwd": "optional/subdir"
}
```

Each key is an array of shell commands run inside the worktree on workspace create / delete / run. Guidelines:

- Setup must be idempotent and fast (aim for under a minute; slow steps make every workspace creation painful)
- Copy secrets/env from the main checkout at setup time, never commit them
- `.superset/config.local.json` (gitignored) lets an individual user extend scripts with `before`/`after` arrays without touching the shared config

Show the user the proposed files and get explicit approval before writing.

## 3. Verify for real

Create a throwaway workspace with `superset workspaces create --project <id> --name "setup-test"` and watch the "Workspace Setup" terminal output. Fix and repeat until it completes cleanly, then delete the test workspace. Setup is not done until a real workspace boots green.
