# Rebrand codemod: Superset → Paradev (private)

The new name is secret until Oct 31 and `superset-sh/superset` is public. Nothing in
this directory goes into the repo. Do not push a branch that contains the new name before
the announcement.

| File | What it is |
|---|---|
| `rebrand.py` | The codemod. Python 3.9+, stdlib only. Report-only by default; `--write` applies. |
| `config.json` | The allowlist: excluded files, protected patterns, protected lines, flagged lines, locale grammar fixes. |
| `prework/0001-display-name-plumbing.patch` | Brand-neutral code change (value is still "Superset"). Can land on `main` publicly any time before Oct 31. |
| `republish-plugins.ts` | Bumps and re-publishes the plugins the codemod touched (`--plugins` mode). Never tags or pushes. |
| `reports/baseline-changed-lines.tsv` | Every line the dry run changed, reviewed. Used to show what is new on Oct 31. |
| `reports/dryrun/summary.json` | Counts, flagged lines and legal-entity hits from the dry run. |

## What it changes and what it leaves

It swaps the capitalized word `Superset` (whole word, ASCII boundaries, so `Superset의`,
`Superset。` and `Superset's` match and `SupersetLogo`, `@superset/*`, `SUPERSET_*` do not)
to `Paradev` in every tracked text file, except where a rule in `config.json` protects it.
Lowercase `superset` and `SUPERSET` are identifiers (CLI, packages, env vars, schemes,
`~/.superset`, `x-superset-*`, domains, `superset-sh`, `superset_sh`) and are never touched.
Uppercase display text is swapped only on lines listed in `upper_display_lines`.

Protected (skipped and counted per rule):

- **Files**: internal docs (`plans/`, `docs/`, `.agents/`, `AGENTS.md`, `design/`), legal
  (`LICENSE*`, `apps/marketing/content/legal/`), generated and vendored files
  (`manifests.generated.ts`, `patches/`, Vale styles), `packages/sdk/src` (the exported
  `Superset` class is public API), `packages/db` and the local-db schema, `packages/sandbox`
  (image theme name and seed data), `apps/desktop/package.json` (`productName`, legal
  author), the dev-profile storage code (`Superset (<workspace>)`, `Superset Dev Workspace (…)`),
  and `plugins/` unless `--plugins`.
- **Patterns**: `Superset Inc.` / `Superset, Inc.`; path segments (`/Superset`,
  `Superset/…`, `Superset.app`, `Superset.AppImage`, `Superset.lnk`); release artifact
  names (`Superset-1.2.3-arm64.dmg`, `Superset-${arch}.dmg`, `Superset-Canary-…`); HTTP header
  names (`Superset-Storage-Key`, `X-Superset-…`); SDK code samples (`import Superset`,
  `new Superset(`); the on-disk ownership markers that agent-setup and the bundled CLI shim use
  to find their own files (`# Superset agent-wrapper v5`, `# Superset copilot hook`,
  `// Superset pi extension`, …); `Superset Screenshots` (existing screenshot folder).
- **Lines**: protocol and marketplace case-variant tests, the CLI's electron-log path,
  the Expo `name` (it names the generated Xcode project and scheme), the Homebrew
  formula class, the canary `productName`.

Locale grammar: the brand is never translated, so `msgid` and `msgstr` are swapped together and
no message loses its translation. Korean particles follow the final sound (슈퍼셋 ends in a
consonant, 파라데브 in a vowel), so 은/을/이/과/으로 become 는/를/가/와/로. Turkish
`'te/'ten/'teki/'tir` become `'de/'den/'deki/'dir` (voiced final consonant). Czech
`Supersetu`/`Supersetem` become `Paradevu`/`Paradevem`. Every fix is listed in
`summary.json` under `locale_grammar_fixups` for a native reader to spot-check.

## Desktop: productName stays "Superset"

`productName` is the Electron app name. Electron derives from it the `userData` directory
(`~/Library/Application Support/Superset`, `%APPDATA%\Superset`, `~/.config/Superset`), the
log directory the CLI reads for `superset feedback`, `sessionData` (cookies, local storage,
IndexedDB of every browser pane), the macOS keychain entry `<name> Safe Storage` that encrypts
those cookies, the `.app` bundle and executable name that Squirrel.Mac replaces in place, the
helper app names, and the Windows install directory. Changing it and pinning `userData` back
with `app.setPath` still moves the logs, the keychain entry and the bundle, and anything that
reads `userData` before the pin runs. That is a data-loss path that can only be tested on a
signed, notarized update from a released build.

So `productName` (and the canary's `"Superset Canary"`) stay, and only display surfaces change:

- `CFBundleName` / `CFBundleDisplayName` (macOS menu bar title, About, Activity Monitor,
  notifications), the Linux desktop entry `Name=`, the macOS app menu label, About / Hide /
  Quit item labels, the About panel name and the notification-center registration. These read
  `displayName` (electron-builder) or `getAppDisplayName()` (main), which the prework patch adds.
  `getAppDisplayName()` swaps only the first word of `app.name`, so the canary keeps
  `… Canary` and dev builds keep `… (<workspace>)`.
- Dev profiles are untouched: `index.ts` still pins `userData` to
  `Superset Dev Workspace (<sha256>)` and calls `app.setName("Superset (<workspace>)")`; the
  codemod excludes `dev-app-profile.ts`, the sweep, the host-service teardown and
  `patch-dev-protocol.ts`, so the sweep still recognizes and never reaps installed profiles.

Verified with an Electron 41.10.7 probe bundle (CFBundleName and CFBundleDisplayName set to a
different name than `productName`): `app.name`, `userData`, `sessionData` and `logs` all stayed on
the `productName` path before and after `ready`.

Known leftover: Finder, the Dock and Spotlight show the bundle file name, `Superset.app`. To show
the new name there without renaming the bundle, add `LSHasLocalizedDisplayName: true` and an
`en.lproj/InfoPlist.strings` with `CFBundleDisplayName` (needs a signed build to verify). Windows
Start-menu shortcut names also come from `productName` (`nsis.shortcutName` can override, but
an upgrade may leave the old shortcut). Mobile: `CFBundleDisplayName` changes the home-screen
name; it needs a new native build (OTA cannot change Info.plist).

## Oct 31 runbook

Runtime: the codemod takes about 3 s, `check:i18n` about 7 s, `lint:fix` under a minute.
`bun install`, typecheck and the full test suite are the long part (tens of minutes on a laptop).
Budget about an hour end to end, including reading `new-since-baseline.tsv`.

```bash
git clone git@github.com:superset-sh/superset.git paradev && cd paradev   # or a fresh worktree of main
git switch -c rebrand-paradev
bun install

# 1. Prework. Skip if it already merged to main (rebrand.py warns if it is missing).
git am ~/superset-private/rebrand/prework/0001-display-name-plumbing.patch

# 2. Preview. Exit code 1 means "there is something to change".
python3 ~/superset-private/rebrand/rebrand.py --repo . --report-dir /tmp/rebrand
#    Read /tmp/rebrand/new-since-baseline.tsv: lines changed today that the dry run did not
#    change. Check the code ones (not .po/.mdx). Add rules to config.json for anything that
#    is an identifier, a path, a marker or a wire value, and run again.

# 3. Apply. Add --plugins to include plugins/ (then do step 6).
python3 ~/superset-private/rebrand/rebrand.py --repo . --write --report-dir /tmp/rebrand

# 4. Idempotency: must print "Would change 0 occurrences" and exit 0.
python3 ~/superset-private/rebrand/rebrand.py --repo . --report-dir /tmp/rebrand-again

# 5. Catalogs, then the usual checks. check:i18n must list no untranslated message.
bun run check:i18n
bun run lint:fix
bun run typecheck
bun run test
git add -A && git commit -m "chore: rename the product to Paradev"

# 6. Plugins (only with --plugins): bump + publish everything that changed, then check.
bun ~/superset-private/rebrand/republish-plugins.ts .
bun run check:plugins
#    Tag with the printed commands only after the commit is on main.
```

`republish-plugins.ts` only bumps plugins whose current `<name>@<version>` tag exists locally,
so run `git fetch --tags origin` first. In the dry run only 4 plugins had local tags; on a full
clone every plugin with an `author.name` change (all 15) gets a patch bump.

## Dry run (2026-10-10, local branch `local-rebrand-dryrun` on main `ded129c702`)

Commits: prework (brand-neutral) → codemod → restore 3 test fixtures (now in `config.json`) →
`--plugins` pass. Never pushed.

- Changed 12,591 occurrences in 768 files (plus 132 in 48 plugin files with `--plugins`):
  i18n catalogs 8,922 · marketing 2,272 · docs 230 · readme 224 · desktop 206 ·
  agent-setup 144 · mobile 126 · api 76 · cli 67 · web 60 · host-service 45 · shared 41 ·
  root files 35 · email 30 · mcp 19 · trpc 19 · auth 12 · .github 11 · discord-triage 8 ·
  review-host 6 · ui 6 · scripts 6 · sdk (README/package.json) 5 · .superset 4 · i18n src/test 4 ·
  port-scanner 2. Korean/Turkish grammar fixups: 133 lines.
- Skipped 993 on purpose: internal docs 472, plugins (default mode) 133, path segments 107,
  dev-profile storage 46, SDK identifier 38, legal entity 37, release artifacts 31, on-disk
  markers 28, generated/vendored 28, legal pages 20, code identifiers 18, DB schema 6, HTTP
  headers 5, sandbox 4, paired fixtures 4, wire case-variant tests 3, electron-log path 3,
  desktop package.json 2, mobile project name 2, domain/member 2, homebrew class 1, canary
  productName 1, GitHub-org case variant 1, screenshot folder 1.
- Idempotency: second run reports 0 changes.
- `check:i18n`: 6,166 messages, 0 missing in all 17 locales. Only remaining brand msgid is
  `© {year} Superset Inc.`.
- `lint:fix`: reflowed 23 (+5 plugin) already-changed files; nothing else.
- Typecheck: the same 319 errors as the prework baseline, all better-auth type inference from
  this machine's install. No new error.
- Tests: baseline had 35 failures (local git/shell environment). After the codemod 3 new ones,
  all fixtures where "Superset" is a project name paired with `"superset"`/`"SUPER"`; those files
  are now excluded and pass. Plugin, agent-setup, cli-plugin and trpc-plugin suites pass after
  `--plugins`. `check:plugins` passes.

## Needs a human decision

- Email sender names (`from: "Superset <noreply@…>"`, 15 sites) and the cloud-workspace git
  author (`SUPERSET_GIT_AUTHOR`), review-host `git config user.name`: swapped; confirm.
- OAuth `client_name` (connector client-metadata, dynamic registration): swapped; old
  registrations keep the old name.
- `apps/mobile/store.config.js` `copyright: "2026 Superset"` became `2026 Paradev`; a copyright
  line probably wants the legal entity.
- `SlackIntegrationDemo.tsx`: `author === "Paradev" ? "S" : "M"` keeps the avatar initial "S".
- `Superset Screenshots` folder kept (new name would split old and new screenshots).
- Dev builds still show `Superset (<workspace>)` in the dock (dev profile code is excluded).
- Changelog and blog posts were swapped like every other content page; exclude
  `apps/marketing/content/changelog/*` / `blog/*` in `config.json` if history should keep the
  old name.
- The macOS About/Hide/Quit labels are English, as Electron's defaults were before.

## Outside this codemod

- Logos, wordmarks, icons, OG images, DMG background, tray icons, App Store screenshots
  (binary assets; `SupersetLogo`/`SupersetIcon` components render the old wordmark).
- Domains (separate env-driven PR), GitHub org/repo, npm scope, social handles, Homebrew
  formula name, protocol schemes, CLI binary, env vars: unchanged by design.
- Third-party dashboards: Slack app name and bot display name (the manifest in
  `apps/api/.../slack/manifest.json` is only a copy), App Store Connect name/subtitle,
  GitHub App name, Sentry/Linear/Google OAuth app names, MCP registry entry, Stripe product
  names, Resend sender name, email templates already sent.
- Server-driven data: `desktop_notices` rows, existing OAuth dynamic registrations
  (`client_name` is sent only on new registrations), agent preset labels already stored in
  host databases.
- Legal: every `Superset Inc.` / `Superset, Inc.` stays until legal renames the entity.
  The dry run found them in the footer, the store listing copy, the personal email layout,
  the Terms/Privacy pages (excluded whole) and one i18n message per locale.
- Compare page slugs (`/compare/superset-vs-*`) and blog slugs keep `superset` in the URL.
