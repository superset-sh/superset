# Contributing to Superset

Thanks for contributing! Please follow our [code of conduct](./CODE_OF_CONDUCT.md).

## Before you start

- **Bug fixes, docs, and small improvements**: open a PR directly. No issue needed.
- **New features or larger changes**: [open an issue](https://github.com/superset-sh/superset/issues/new/choose) first so we can agree on the approach before you build it.
- **Questions**: ask in [Discord](https://discord.gg/cZeD9WYcV7) instead of opening an issue.

## Local development

Development is expected to run from a Superset workspace, which is a managed
git worktree. Add your clone to the installed Superset app, create a workspace
for your change, then run the following commands in that workspace:

```bash
./.superset/setup.local.sh
bun run dev
```

Run `setup.local.sh` once in every new worktree before starting development. It
configures workspace-specific app identity, ports, local services, and a seeded
development account so the dev desktop app can run alongside the installed app.
No Neon or third-party credentials are needed.

See [**DEVELOPMENT.md**](./DEVELOPMENT.md) for the full guide.

## Opening a pull request

1. [Fork the repo](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) and branch from `main`.
2. Make your change, then check it locally:
   ```bash
   bun run lint      # CI fails on warnings too. Run `bun run lint:fix` first.
   bun run typecheck
   bun run test
   bun run check:i18n  # Only if you touched user-facing strings; commit the catalogs it regenerates.
   ```
3. [Open a PR from your fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) and fill in the template. Check **"Allow edits from maintainers"** so we can touch up your branch. It speeds up review a lot.

### What gets a PR merged fast

- **A conventional-commit title.** We squash-merge with the title as the commit subject, so it needs to look like `feat(desktop): add copy-logs button` or `fix(web): guard against missing PR`.
- **One change per PR.** Small PRs get reviewed in hours. If you found an unrelated bug along the way, open a second PR.
- **Proof it works — screenshots strongly preferred.** Say what you ran or clicked, and show it. Any user-visible change needs a screenshot or recording in the PR description; for bug fixes, before/after screenshots are ideal. A PR with screenshots gets reviewed much faster than one we have to check out and run ourselves. See [capturing screenshots via CDP](#capturing-screenshots-via-cdp) below.
- **A linked issue for non-trivial changes** so reviewers have the context.

### Capturing screenshots via CDP

The dev desktop app exposes the Chrome DevTools Protocol, so you (or your coding agent) can drive the real app and capture screenshots without manual cropping:

1. Launch the dev app with a debugging port: `RENDERER_REMOTE_DEBUG_PORT=9222 bun dev` (pick an unused port — multiple workspaces often run at once).
2. Confirm you're attached to *this* workspace's app: fetch `http://127.0.0.1:<port>/json/list` and check the page target's URL matches your workspace's `DESKTOP_VITE_PORT` from `.env`. Never assume a responding CDP endpoint is yours.
3. Navigate the real UI to the state you changed (real clicks and input, not injected DOM state), then capture with `Page.captureScreenshot`.

For the full workflow — attaching over WebSocket, matching the right renderer, repairing auth, and what counts as end-to-end evidence — see [`.agents/skills/cdp-verification/SKILL.md`](./.agents/skills/cdp-verification/SKILL.md). `apps/desktop/scripts/cdp-smoke-integrations.ts` is a working example script.

## Style

We follow [Clean Code](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) and the boy scout rule: leave the code cleaner than you found it. Biome enforces formatting and linting. Run `bun run lint:fix` and you're done.
