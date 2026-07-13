# Contributing to Superset

Thanks for contributing! Please follow our [code of conduct](./CODE_OF_CONDUCT.md).

## Before you start

- **Bug fixes, docs, and small improvements**: open a PR directly. No issue needed.
- **New features or larger changes**: [open an issue](https://github.com/superset-sh/superset/issues/new/choose) first so we can agree on the approach before you build it.
- **Questions**: ask in [Discord](https://discord.gg/cZeD9WYcV7) instead of opening an issue.

## Local development

See [**DEVELOPMENT.md**](./DEVELOPMENT.md) for the full guide. TL;DR:

```bash
./.superset/setup.local.sh
bun run dev
```

No Neon or third-party credentials needed.

## Opening a pull request

1. [Fork the repo](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) and branch from `main`.
2. Make your change, then check it locally:
   ```bash
   bun run lint      # CI fails on warnings too. Run `bun run lint:fix` first.
   bun run typecheck
   bun run test
   ```
3. [Open a PR from your fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) and fill in the template. Check **"Allow edits from maintainers"** so we can touch up your branch. It speeds up review a lot.

### What gets a PR merged fast

- **A conventional-commit title.** We squash-merge with the title as the commit subject, so it needs to look like `feat(desktop): add copy-logs button` or `fix(web): guard against missing PR`.
- **One change per PR.** Small PRs get reviewed in hours. If you found an unrelated bug along the way, open a second PR.
- **Proof it works.** Say what you ran or clicked. UI changes need a screenshot or recording.
- **A linked issue for non-trivial changes** so reviewers have the context.

## Style

We follow [Clean Code](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) and the boy scout rule: leave the code cleaner than you found it. Biome enforces formatting and linting. Run `bun run lint:fix` and you're done.
