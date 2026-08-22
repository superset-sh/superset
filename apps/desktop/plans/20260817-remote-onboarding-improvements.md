# Remote-workspace onboarding: audit + improvements

User report (laptop → Mac mini): clicked **Set up project…**, landed on a settings
page with no obvious next step, then hit
`Failed to clone repository: … fatal: could not read Username for 'https://github.com': terminal prompts disabled`.

## Audit: why the flow failed

1. **The clone was doomed before the UI ever loaded.** On a daemon-launched host
   (`superset start`, launchd), `LocalGitCredentialProvider` resolved `gh` / git
   credential helpers against the daemon's own `process.env` — whose PATH has no
   Homebrew. Every other gh call site in host-service uses the login-shell env
   (`getStrictShellEnvironment`); the clone credential path was the one
   exception. Result: no token found, `GIT_TERMINAL_PROMPT=0`, clone dies.
2. **No preflight.** `project.setup` cloned blind; the first signal that the host
   couldn't reach GitHub was raw git stderr in a toast.
3. **The CTA deep-linked to nothing.** "Set up project…" navigated to the top of
   the project settings page with no anchor, no highlight, no auto-opened modal.
   On an unconfigured host most sections are hidden, so the page reads as
   "nothing to do here". The actual entry is a small button inside
   "Location & checkout".
4. **Free-text parent directory** with a Linux placeholder, no suggested default
   (onboarding defaults to `~/.superset/projects`; this modal didn't).
5. **No add-host flow at all.** Settings → Hosts empty state was the string
   "No hosts yet." with no CTA; the install/auth/start steps lived only in docs.

Patterns applied (from Coder / Codespaces / Tailscale / VS Code Tunnels — see
research refs below): preflight git auth as a visible check on the create form,
not a clone-time failure; translate raw git errors into one inline fix-it
action; copyable one-liner + live "waiting for machine" that flips when the
host connects; deep-link into the action, never into a settings page.

## Shipped in this change

- **host-service**
  - `LocalGitCredentialProvider` defaults to the login-shell env (falls back to
    `process.env`) — fixes the reported clone failure whenever `gh` is set up
    on the host.
  - `project.checkCloneAccess` (query): `git ls-remote` with the exact env a
    real clone would use, classified as `auth | not_found | network | unknown`,
    plus gh CLI state (`authenticated | unauthenticated | not_installed`).
- **Setup modal** (`SetupProjectModal`)
  - Live access check with per-cause remediation: copyable
    `gh auth login…` / `brew install gh…` command for remote hosts, in-app
    `GhAuthDialog` sign-in for the local host, "Check again" button. Older
    hosts without the procedure degrade to no panel. Clone stays enabled
    (public repos don't need auth).
  - Clone/import errors render inline in the modal, classified by the shared
    `classifyCloneError` (promoted out of onboarding), instead of raw-stderr
    toasts.
  - Parent directory prefills to `<host home>/.superset/projects` (same
    default as onboarding), resolved via `filesystem.browseHost`.
- **Project settings** (`V2ProjectSettings`)
  - "Set up project…" CTAs now deep-link with `focus=setup`, which auto-opens
    the setup modal (one-shot per project+host).
  - A "Not set up on {host} yet" banner with the setup CTA sits at the top of
    the page whenever the targeted host lacks the project.
- **Add-host flow**
  - `AddHostGuide`: install/auth/start copyable commands + live "waiting for
    the host" state that flips to a success card when the machine registers.
    Rendered at `/settings/hosts/new` and as the Hosts empty state (which
    auto-navigates to the host page the moment it comes online).
  - "Add host…" entry in the hosts settings sidebar; "Add another device…" in
    the new-workspace DevicePicker.

## Hardening after the live walkthroughs

Three failure modes found while filming and verifying, fixed in this branch:

- **`~` paths**: `project.setup` resolved typed paths with `path.resolve`, so `~/dev` became a
  literal `~` folder under the daemon's cwd. All user-supplied setup paths (clone parent dir,
  import path, create flows) now go through a shared `expandTildeAbsolute`
  (`packages/host-service/src/runtime/paths/`), which expands `~` and rejects relative paths.
- **Silently hidden preflight**: the access check's catch-all treated every failure as
  "old host, stay quiet". Transport failures now render a "Can't reach {host}" panel; only a
  missing procedure stays silent.
- **Stale verdict during recheck**: the panel showed the previous result while a refetch ran
  (green flashing over a broken host). Any in-flight check now shows the checking spinner.

## North star (from the pairing + auth-handoff research sweeps, 08-20)

The flow above is three user-facing ceremonies; the strongest established patterns have one or
zero. Everything in this doc should be read as scaffolding toward deleting them, not as the
destination:

1. **Add host = one paste.** The waiting screen mints a single-use, join-scoped token (10-15 min,
   dead on first redemption) embedded in one copyable command; `superset auth login` disappears
   from the host. Trust direction per WhatsApp/Signal/CRD: the trusted surface initiates and
   consents; the new machine never types an account credential. On redemption the waiting card
   shows hostname/OS/IP/time (Vercel's checklist) and ideally a Stripe-style pairing phrase
   printed on both ends. Device-code auth is the CLI-first fallback (Storm-2372 taught the
   industry its phishing shape; pre-authorized tokens dodge it structurally). LAN discovery is an
   accelerant on top, never the only path.

   Command shape (agreed 08-21): the token rides in the URL, not a flag, and the server bakes
   it into the script it serves, so the paste is exactly

       curl -fsSL superset.sh/j/ab12cd34 | sh

   with `superset join ab12cd34` as the secondary line for machines that already have the CLI.
   Two rules keep that safe: fetching `/j/<token>` never redeems it (link unfurlers and URL
   scanners GET anything that looks like a link; serving the script is idempotent, redemption is
   the installer's POST from the host), and the token's blast radius is one host registration,
   which the waiting card surfaces immediately and the user can evict. A Wormhole-style phrase
   instead of hex is optional polish.

   Interim, shipped 08-22: the Add host guide mints an API key itself and shows
   `superset auth login --api-key … --organization … && superset start --daemon` as the one
   paste, so the browser login on the host is gone today. It is still an account-scoped key
   (revocable under API keys), which is exactly what the join token replaces.
2. **GitHub connected once, brokered everywhere.** Account-level GitHub connection; hosts receive
   short-lived scoped tokens over the relay via the existing GIT_ASKPASS plumbing (the
   Codespaces/Coder/Daytona model). Per-host `gh auth login` — and therefore the amber panel —
   demotes to a fallback. Also dissolves the SSH-URL dead end.
3. **"Set up project on host" stops being a user-facing concept.** Shipped on this branch
   (composer `ClonePlanPill` in the picker row + `setupFirst` in the create pipeline, "will
   clone" hints in the project list; verified live against a second host: amber on a signed-out
   host, green after sign-in, one submit = clone then workspace). Creation subsumes setup: pick
   repo + host in the composer, one inline "will clone to ~/.superset/projects" note with an edit
   affordance and the access check running in place, Cmd+Enter does clone → workspace in one
   motion. Import-vs-clone becomes detection (findByPath). The settings modal stays as the
   management surface, not the mainline.

## Follow-ups (not in this change)

- **Remote gh sign-in without leaving the app**: run `gh auth login` in a
  host-service terminal session on the target host, scraping the one-time code
  like `GhAuthDialog` does locally. Requires host-level (non-workspace)
  terminal sessions.
- **Dead-end surfaces**: `OpenInWorkspaceV2`, `RunInWorkspacePopoverV2`,
  `RunIssuesInWorkspacePopover` still say "Project not set up on this host"
  with no CTA — link them to the same `focus=setup` deep link.
- **SSH clone URLs** get no credential help (`httpsHost()` returns null); the
  classifier tells users to switch to HTTPS, but we could rewrite
  `git@github.com:` remotes to HTTPS when a token is available.
- **Recovery mode** (Codespaces pattern): when clone/setup fails partway,
  offer the workspace shell + creation log + retry instead of rollback-only.
- **Preflight on the new-workspace form itself** (Coder pattern): surface the
  access check before the user ever submits, on the project+host pair picked
  in the modal.

Research refs: Coder external auth (gated create-form step, GIT_ASKPASS),
Codespaces (repo-scoped token injection, recovery mode), VS Code Tunnels
(device-code auth on the host), Tailscale (copy one-liner, loop closes in the
UI you started from), Gitpod #4696 (show only the provider the repo needs),
DevPod (quickstart escape hatch).
