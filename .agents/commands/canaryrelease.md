---
description: Trigger a canary build of the desktop app (rolling internal-testing release, not a versioned stable release)
allowed-tools: Bash
---

Trigger the desktop canary release workflow. This is distinct from `bun run release desktop` (which cuts a real versioned stable release) — canary is a rolling, prerelease-tagged internal-testing build (`desktop-canary`) that gets force-rebuilt and replaces the previous one each time.

## Steps

1. Run `bash scripts/release-canary.sh $ARGUMENTS` from the repo root.
   - With no argument, it triggers `release-desktop-canary.yml` (via `gh workflow run`) against the current default branch.
   - With a commit SHA/ref argument, it pushes that commit to a temp `canary-release-<sha>` branch first, then triggers the workflow against that branch.
2. The script prints the GitHub Actions run URL — share it with the user.
3. Optionally poll `gh run view <run-id>` or check the run URL to confirm the build succeeded and the `desktop-canary` release/tag was updated.

No confirmation is needed before running this — canary is a low-stakes rolling internal build, not a user-facing release.
