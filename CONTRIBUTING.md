# Contributing to Superset

Thanks for contributing! Please follow our [code of conduct](./CODE_OF_CONDUCT.md) in all interactions with the project.

## Before you start

- **Bug fixes, docs, and small improvements** — open a PR directly. No issue required.
- **New features or larger changes** — [open an issue](https://github.com/superset-sh/superset/issues/new/choose) first so we can agree on the approach before you invest time in it.
- **Questions** — ask in [Discord](https://discord.gg/cZeD9WYcV7) rather than opening an issue.

## Local development

See [**DEVELOPMENT.md**](./DEVELOPMENT.md) for the full guide. TL;DR:

```bash
./.superset/setup.local.sh
bun run dev
```

No Neon or third-party credentials required for local development.

## Opening a pull request

1. [Fork the repo](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) and create a branch from `main`.
2. Make your change, then verify it passes checks locally:
   ```bash
   bun run lint      # CI fails on warnings, not just errors — use `bun run lint:fix` first
   bun run typecheck
   bun test
   ```
3. [Open a PR from your fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) and fill in the PR template. Check **"Allow edits from maintainers"** so we can rebase or touch up your branch — it speeds up review considerably.

### What makes a PR easy to merge

- **A conventional-commit title.** PRs are squash-merged with the title as the commit subject, so it must look like `feat(desktop): add copy-logs button` or `fix(web): guard against missing PR`.
- **One change per PR.** Small, focused PRs get reviewed in hours; grab-bag PRs sit for days. If you found an unrelated bug along the way, open a second PR.
- **Evidence it works.** Say what you ran or clicked to verify the change. UI changes need a screenshot or recording.
- **A linked issue for non-trivial changes**, so reviewers have the context without re-deriving it.

## Style

We follow [Clean Code](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) guidelines and the boy scout rule: leave the code cleaner than you found it. Formatting and linting are enforced by Biome — run `bun run lint:fix` and you're done.
