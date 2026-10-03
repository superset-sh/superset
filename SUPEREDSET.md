# Superedset

Superedset is Alexander's personal Superset build. It follows the latest stable,
non-canary upstream desktop release, adds one distribution commit, then adds
exactly one squashed commit for each open PR authored by `theblondealex` against
`superset-sh/superset`.

## Branch rules

- `upstream/main` is the untouched Superset source.
- `origin/superedset-config` contains only the Superedset name, updater, build
  workflow, and this guide.
- `origin/main` is generated from the latest stable `desktop-v*` upstream tag,
  the configuration commit, and the open PR commits. Never develop or commit
  directly on it.
- Feature branches always start from `upstream/main`. This prevents Superedset
  files from appearing in upstream PRs.

Create a feature and open its PR normally:

```bash
git fetch upstream
git switch -c feat/my-feature upstream/main
# Make the change, then squash the branch to one commit.
git push -u origin feat/my-feature
gh pr create --repo superset-sh/superset --base main
```

Rebuild the personal branch after opening or updating a PR:

```bash
cd <path-to-your-main-worktree>
bun run superedset:update
```

The command stops if the worktree is dirty or an open PR has more than one
commit. It recreates `main`, pushes with `--force-with-lease`, and triggers the
rolling Superedset release. Resolved integration commits are reused on later
updates, including when the command runs from another Mac.

The `Sync Superedset` GitHub workflow checks hourly for a new stable upstream
desktop release. Pushes to fork feature branches also run it immediately, so an
updated open PR produces a new build without waiting for the schedule. It does
nothing when the stable release and open PR commits are unchanged; otherwise it
updates fork `main` and starts a signed release build.

## Shared data

Superedset uses the same data as the official Superset app:

- `~/Library/Application Support/Superset`
- `~/.superset`

Quit Superset before opening Superedset, and quit Superedset before opening
Superset. They must not write to the shared profile simultaneously.

The apps share user data but use separate updater caches. Superedset must keep
`@superedsetdesktop-updater`; using Superset's cache can install a staged
official build into the fork app.

## Apple certificate

1. Join the Apple Developer Program.
2. In the Apple Developer Certificates portal, create a **Developer ID
   Application** certificate using a CSR from Keychain Access.
3. Install the downloaded certificate on the Mac that created the CSR.
4. In Keychain Access, export the certificate and its private key as a
   password-protected `.p12` file.
5. Create an app-specific password at `appleid.apple.com` for notarization.

Configure the fork's `production` GitHub environment. Each `gh secret set`
command prompts securely for its value:

```bash
base64 -i Superedset.p12 | gh secret set MAC_CERTIFICATE --env production --repo theblondealex/superset
gh secret set MAC_CERTIFICATE_PASSWORD --env production --repo theblondealex/superset
gh secret set APPLE_ID --env production --repo theblondealex/superset
gh secret set APPLE_ID_PASSWORD --env production --repo theblondealex/superset
gh secret set APPLE_TEAM_ID --env production --repo theblondealex/superset
printf %s https://api.superset.sh | gh secret set NEXT_PUBLIC_API_URL --env production --repo theblondealex/superset
printf %s https://app.superset.sh | gh secret set NEXT_PUBLIC_WEB_URL --env production --repo theblondealex/superset
printf %s https://relay.superset.sh | gh secret set RELAY_URL --env production --repo theblondealex/superset
printf %s https://realtime.superset.sh | gh secret set REALTIME_URL --env production --repo theblondealex/superset
gh variable set SUPEREDSET_RELEASES_ENABLED --body true --repo theblondealex/superset
```

After configuring the secrets, run the `Release Superedset` workflow once from
GitHub Actions. Future updates run whenever generated `main` changes.

## Another Mac

Install the latest architecture-appropriate DMG from the fork's rolling
`desktop-superedset` release. The installed app then checks that same release
for updates.

To develop on that Mac as well:

```bash
git clone https://github.com/theblondealex/superset.git
cd superset
git remote add upstream https://github.com/superset-sh/superset.git
git fetch upstream
bun install --frozen
```

Feature branches still start from `upstream/main`; use the generated `main`
only to run and release Superedset.
