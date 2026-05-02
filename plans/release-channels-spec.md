# Release Channels Spec — Desktop / Canary / CLI

## Background

`superset-sh/superset` publishes multiple distinct release streams to a single
GitHub repo:

- Desktop stable (`desktop-v*` tags)
- Desktop canary (rolling `desktop-canary` tag)
- CLI stable (`cli-v*` tags)

GitHub's `/releases/latest` endpoint returns the most recent non-draft,
non-prerelease release on the repo, ranked by `created_at`. **It does not
filter by tag prefix.** Desktop's auto-updater hardcodes that endpoint
(`apps/desktop/src/main/lib/auto-updater.ts:52`), which means the next CLI
release we publish would silently break desktop auto-update for every
installed user until the next desktop release supersedes it.

The CLI side already side-stepped this by writing a rolling `cli-latest`
release and reading from `releases/download/cli-latest/` directly
(`build-cli.yml:135-153`, `packages/cli/src/commands/update/command.ts:26`).
The desktop side has no equivalent and still reads `/releases/latest`.

## Current state (2026-04-29) — temporary workaround in place

Both the per-CLI-version release and the `cli-latest` rolling release in
`.github/workflows/build-cli.yml` are now created with `--prerelease`. This
keeps them off `/releases/latest` so the next published `cli-v*` release does
not shadow desktop. CLI tarballs remain publicly accessible via
`releases/download/<tag>/` (prereleases are public; only drafts require auth).

`--prerelease` is **not** the long-term answer — it conflates "prerelease" (a
real concept the CLI will eventually need for canary builds) with "different
release stream" (what's actually going on). The proper fix is below.

## Goals

1. Each client fetches updates from a stable, channel-specific URL that other
   release streams cannot accidentally point at.
2. Desktop and CLI release on independent cadences. No coupling.
3. `--prerelease` becomes a real signal again — used only for canary CLI
   builds, not the entire CLI stream.
4. Dropping the `--prerelease` workaround requires zero coordination with
   already-installed desktop clients (no breakage during migration).

## Channel taxonomy

| Channel | Tag pattern | Rolling pointer | Consumer | Prerelease flag (target state) |
| --- | --- | --- | --- | --- |
| Desktop stable | `desktop-v*` | `desktop-latest` (NEW) | Desktop auto-updater (stable build) | no |
| Desktop canary | rolling `desktop-canary` | n/a (it IS the rolling tag) | Desktop auto-updater (canary build) | yes |
| CLI stable | `cli-v*` | `cli-latest` | `superset update` | no |
| CLI canary | TBD (`cli-canary-v*` + rolling `cli-canary`) | `cli-canary` | `superset update --canary` (NEW, optional) | yes |

## Source-of-truth URLs per consumer

- **Desktop stable build** → `https://github.com/superset-sh/superset/releases/download/desktop-latest/latest-{mac,linux}.yml`. Today reads from `/releases/latest/download/`. **Must move to `desktop-latest`.**
- **Desktop canary build** → `https://github.com/superset-sh/superset/releases/download/desktop-canary/latest-{mac,linux}.yml`. Already correct.
- **CLI stable** → `https://github.com/superset-sh/superset/releases/download/cli-latest/version.txt` and matching tarballs. Already correct.
- **CLI canary** (future) → `https://github.com/superset-sh/superset/releases/download/cli-canary/version.txt` and tarballs.

After migration, **no consumer reads `/releases/latest`**. That endpoint becomes irrelevant for our update flows, which removes the cross-stream collision class entirely.

## Why CLI versions are NOT locked to desktop versions

We considered matching them (e.g. CLI v1.7.2 ships when Desktop v1.7.2 ships).
We're not doing that. Reasons:

- Desktop ships weekly; CLI does not. Lock-stepping forces empty CLI releases or empty desktop releases. Confusing for users, taxing for us.
- Desktop and CLI have different update mechanisms (Squirrel/AppImage vs tarball + atomic-replace), different platform matrices (4 platforms vs 3), different artifact shapes. The semver they expose is not the same kind of versioning.
- The thing they actually share — the bundled host-service runtime — has its own version. **That** version drives compatibility. Marketing alignment of CLI/desktop semver doesn't help users; host-service version compatibility does.
- Independent versions keep CI simple — `build-cli.yml` and `release-desktop.yml` are already gated by independent `paths:` filters, no cross-coupling.

**Decision**: CLI versions are independent of desktop versions. Both clients bundle a host-service. The cloud API tracks min-supported host-service version separately (out of scope for this ticket; tracked elsewhere).

## Migration steps

Sequenced. Each step is non-breaking on its own; ordering matters.

### Step 1 — Add `desktop-latest` rolling release to `release-desktop.yml`

Mirror the `cli-latest` block in `build-cli.yml:135-153`:

```yaml
- name: Update rolling desktop-latest release
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    VERSION_TAG: ${{ github.ref_name }}
  run: |
    set -euo pipefail
    gh release delete desktop-latest --yes --cleanup-tag || true
    gh release create desktop-latest \
      release-artifacts/* \
      --title "Latest Superset Desktop" \
      --notes "Rolling pointer to the latest published desktop release. See [${VERSION_TAG}](https://github.com/${{ github.repository }}/releases/tag/${VERSION_TAG}) for changelog." \
      --target "${{ github.sha }}"
```

Bootstrap manually once against the current `desktop-v1.7.2` so existing installs that haven't received step 2 yet keep working through the transition:

```bash
# Run once after step 1 lands
gh release download desktop-v1.7.2 --pattern '*' --dir /tmp/desktop-bootstrap
gh release create desktop-latest /tmp/desktop-bootstrap/* \
  --title "Latest Superset Desktop" \
  --notes "Rolling pointer to the latest published desktop release." \
  --target $(gh release view desktop-v1.7.2 --json targetCommitish --jq .targetCommitish)
```

### Step 2 — Switch desktop auto-updater feed URL

`apps/desktop/src/main/lib/auto-updater.ts:52`:

```diff
-  : "https://github.com/superset-sh/superset/releases/latest/download";
+  : "https://github.com/superset-sh/superset/releases/download/desktop-latest";
```

Ship in next desktop release (`desktop-v1.7.3` or whatever's next). Verify the new build picks up `desktop-latest/latest-mac.yml` correctly in a manual smoke test before publishing.

### Step 3 — Wait for installed-desktop migration

The OLD `releases/latest/download` URL keeps working for any desktop client running pre-step-2 code, AS LONG AS we don't publish a non-prerelease CLI release in this window. So:

- Step 2 → step 4 → step 5 must complete before any non-prerelease CLI release.
- Step 1 should land before Step 2 ships, so the new feed URL has a target to read from on day one.

Soak time before step 5: ~2 weeks. Long enough for most desktop installs to auto-update onto step 2. Telemetry signal: count of desktop checkins reporting `version >= <step-2 release>` exceeds N% of total weekly active.

### Step 4 — Verify migration

Before step 5:

- ✅ `desktop-latest` rolling release exists and is current.
- ✅ A test desktop build pointing at `desktop-latest` successfully auto-updates.
- ✅ The pre-step-2 desktop build (still pointing at `/releases/latest`) successfully auto-updates AS LONG AS no non-prerelease CLI release has been published in the interim.
- ✅ `gh api repos/superset-sh/superset/releases/latest --jq .tag_name` returns a `desktop-v*` tag (i.e. CLI's `--prerelease` workaround is still effective).

### Step 5 — Drop `--prerelease` workaround from `build-cli.yml`

Remove `--prerelease` from both:
- The per-version `gh release create "${{ github.ref_name }}"` call.
- The rolling `gh release create cli-latest` call.

Remove the workaround comments. Update `plans/release-channels-spec.md` to mark the migration done; archive to `plans/done/`.

After this step: `/releases/latest` will start pointing at whichever stream had the most-recently-published release. No consumer reads it, so this is fine. (It's still the public-facing default for users browsing the repo's Releases page; that's acceptable — they'll see whichever release was newest.)

### Step 6 (optional, future) — Add CLI canary channel

Mirror the desktop-canary pattern:

- New job in `build-cli.yml` triggered on a different branch or workflow_dispatch input, building artifacts and publishing as a rolling `cli-canary` release marked `--prerelease`.
- New flag on `superset update --canary` that reads from `releases/download/cli-canary/` instead of `cli-latest`.
- Tag pattern TBD: either a real `cli-canary-v0.1.0-rc.1` semver-prerelease tag per build, or pure rolling-only with no per-build tag (matches `desktop-canary` precedent — desktop canary has no per-build tag either, just the rolling one).

Not v1-blocking. File as a follow-up ticket once stable CLI is shipping.

## Files involved

- `.github/workflows/release-desktop.yml` — add `desktop-latest` rolling release block (step 1).
- `.github/workflows/build-cli.yml` — drop `--prerelease` from both `gh release create` blocks (step 5). Add `cli-canary` block (step 6).
- `apps/desktop/src/main/lib/auto-updater.ts:50-52` — switch stable feed URL to `releases/download/desktop-latest` (step 2).
- `packages/cli/src/commands/update/command.ts:26` — already correct for stable; add `cli-canary` URL alongside in step 6.

## Acceptance

- ✅ Publishing a `cli-v*` release does not change `/releases/latest`.
- ✅ Publishing a `desktop-v*` release does not change `/releases/latest`.
- ✅ `superset update` always finds the newest stable CLI even when desktop has published more recently.
- ✅ Desktop auto-updater always finds the newest stable desktop even when CLI has published more recently.
- ✅ `desktop-latest` always points at the SHA of the newest stable desktop release.
- ✅ `cli-latest` always points at the SHA of the newest stable CLI release.
- ✅ Existing desktops on pre-migration code still update successfully through the transition (mitigated by step ordering 1 → 2 → 3 → 4 → 5).
- ✅ Future `cli-canary` channel is independent of `cli-latest`; flipping `superset update --canary` does not affect non-canary users.

## Risks pinned

1. **Step ordering is load-bearing.** If step 5 lands before step 2 ships and soaks, pre-step-2 desktops break on the next CLI release. Don't reorder.
2. **`desktop-latest` bootstrap is a one-time manual step.** If skipped, the first desktop client to hit step-2 code with no `desktop-latest` release present will fail update. Mitigated by running the bootstrap as part of step 1's PR.
3. **GitHub API rate limits on the rolling-tag pattern.** Recreating a release on every publish requires `gh release delete` + `gh release create`, which is two API calls per workflow run. Negligible at our cadence (well under hundreds/hour).
4. **Search engines and external links to `/releases/latest`** will surface whichever stream published most recently. Cosmetic; no user-facing breakage. Document in release notes or pin a "Looking for downloads?" issue if needed.

## Non-goals

- Not centralizing version metadata across streams (no shared `versions.json`).
- Not building a release-coordination service. GitHub Releases + tags is the truth.
- Not aligning CLI semver to desktop semver. See "Why CLI versions are NOT locked to desktop versions" above.
- Not changing the host-service version-compatibility model. Out of scope.
