---
name: contribute
description: Set up a Superset open-source contribution, from forking and cloning superset-sh/superset through local dev setup and the repo's rules to a merge-ready PR. Use when the user wants to contribute to Superset, fix a Superset bug themselves, add a feature to Superset, or prepare a PR against superset-sh/superset.
argument-hint: what they want to contribute
allowed-tools: Bash(gh:*) Bash(bun:*) Bash(git:*)
---

# Contribute to Superset

Take the user from "I want to fix/build X in Superset" to a merge-ready PR that follows the repo's rules. If the checked-out repo has `CONTRIBUTING.md`, `DEVELOPMENT.md`, or `AGENTS.md`, those files are authoritative; read them and prefer them over this summary.

## 1. Scope first

- Bug fixes, docs, small improvements: straight to a PR, no issue needed
- New features or larger changes: open an issue first at https://github.com/superset-sh/superset/issues/new/choose to agree on the approach before building
- Questions: Superset Discord, not an issue

## 2. Set up

1. `gh auth status`, then fork and clone: `gh repo fork superset-sh/superset --clone` (or add a fork remote to an existing clone)
2. Best experience: add the clone as a project in the Superset app and create a workspace per change, so contributions develop inside managed worktrees
3. In the new workspace/worktree, run `./.superset/setup.local.sh` once (configures per-workspace ports, app identity, local services, and a seeded dev account; no external credentials needed), then `bun run dev`
4. Bun only, never npm/yarn/pnpm. Read the root `AGENTS.md` and follow it.

## 3. Make it merge-ready

- Branch from `main`; one change per PR, so unrelated finds become a second PR
- Before pushing: `bun run lint:fix`, then verify `bun run lint` exits clean (CI fails on warnings too), `bun run typecheck`, `bun run test`
- PR title must be a conventional commit (`feat(desktop): ...`, `fix(web): ...`); PRs are squash-merged with the title as the commit subject
- Include proof it works: screenshots or recordings for anything user-visible, before/after for fixes. The dev desktop app exposes CDP for clean captures; see "Capturing screenshots via CDP" in CONTRIBUTING.md
- Check "Allow edits from maintainers" and link the issue for non-trivial changes

## 4. Open it

`gh pr create` against `superset-sh/superset` `main`, fill in the PR template honestly (what you ran, what you clicked, what's covered by tests), and report the PR URL back to the user.
