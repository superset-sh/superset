---
name: setup
description: Make a repository Superset-ready — author .superset/config.json with setup/teardown/run scripts so every new workspace boots configured, then verify with a real workspace. Use when the user wants to set up a project or repo for Superset, configure workspace setup scripts, or fix a failing workspace setup.
---

# Superset Project Setup

Goal: every new workspace (isolated git worktree) for this repo comes up ready — dependencies installed, env present, services reachable — without manual steps.

## 1. Inspect the repo

Work out what a fresh worktree needs, and ask about anything ambiguous:

- Package manager and install command (lockfiles decide: bun/pnpm/yarn/npm, cargo, uv, ...)
- Env files: `.env` is usually gitignored, so new worktrees need it copied from the main checkout or generated from `.env.example`
- Services (docker-compose, databases) and dev command + ports
- Monorepo layout (does setup need a `cwd`?)

## 2. Author `.superset/config.json`

This file is what wires lifecycle scripts in — a bare `setup.sh` without `config.json` is NOT picked up. Schema:

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
- Copy secrets/env from the main checkout at setup time — never commit them
- `.superset/config.local.json` (gitignored) lets an individual user extend scripts with `before`/`after` arrays without touching the shared config

Show the user the proposed files and get explicit approval before writing. Include the exact project, host, workspace name, branch, and planned test-workspace deletion in the approval before verification.

## 3. Verify for real

Create a throwaway workspace with `superset workspaces create --local --project <project-id> --name <unique-test-name> --branch <unique-test-branch> --json` and capture its returned workspace ID. Use `--host <host-id>` instead of `--local` for a remote project. Watch the "Workspace Setup" terminal output, fix failures, and repeat until it completes cleanly. Delete only the captured test workspace ID, using the same explicit `--local` or `--host` target, after the approved verification finishes. Setup is not done until a real workspace boots green.
