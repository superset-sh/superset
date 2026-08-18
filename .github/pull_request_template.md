<!--
PR titles become the squash-merge commit subject, so use conventional commit format:
  feat(desktop): add copy-logs button to failed CI checks
  fix(web): guard against missing PR in workspace header
-->

## What & why

<!-- What changed and the problem it solves. Link the issue if there is one (e.g. "fixes #123"). -->

## How I tested it

<!--
What you ran or clicked to verify this works. Screenshots are strongly preferred
for anything user-visible — before/after for bug fixes. See "Capturing screenshots
via CDP" in CONTRIBUTING.md for how to capture them from the dev app.
-->

## Checklist

- [ ] PR title follows conventional commits (`type(scope): subject`)
- [ ] `bun run lint` and `bun run typecheck` pass (CI fails on lint warnings too)
- [ ] "Allow edits from maintainers" is checked on fork PRs
