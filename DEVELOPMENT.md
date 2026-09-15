# Developing Superset

This guide is for contributors building Superset from source. If you just want to use Superset, [download the macOS app](https://github.com/superset-sh/superset/releases/latest) instead.

## Prerequisites

| Tool | Install |
|:-----|:--------|
| [Bun](https://bun.sh/) v1.3.14+ (pinned in `.bun-version`) | `curl -fsSL https://bun.sh/install \| bash` |
| [Docker](https://docs.docker.com/get-docker/) | Docker Desktop or OrbStack |
| `jq` | `brew install jq` (Linux: `sudo apt-get install -y jq`) |
| Git 2.20+ and [`gh`](https://cli.github.com/) | `brew install gh` (Linux: [gh apt repo](https://github.com/cli/cli/blob/trunk/docs/install_linux.md)) |

macOS is the primary supported platform. Windows is untested. Linux works, but
needs the extra setup in [Linux prerequisites](#linux-prerequisites) first.

## Linux prerequisites

Verified on Ubuntu 24.04 / X11. Do all of this before `./.superset/setup.local.sh`,
except the Electron sandbox step, which needs `node_modules` to exist.

Install `bun` at the version in `.bun-version` rather than the latest release, so
`bun.lock` doesn't churn:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v$(cat .bun-version)"
```

**X11 headers for `native-keymap`.** Without them `bun install` fails in the
`@superset/desktop` postinstall with `Package 'xkbfile', required by 'virtual:world', not found`:

```bash
sudo apt-get install -y libxkbfile-dev
```

**A hosts entry for `db.localtest.me`.** The name resolves to `127.0.0.1` in public
DNS, but systemd-resolved drops answers that point at loopback, so the neon-proxy
connection string fails with `ConnectionRefused` even though the container is
healthy:

```bash
echo '127.0.0.1 db.localtest.me' | sudo tee -a /etc/hosts
```

**A higher inotify instance limit.** The default of 128 is not enough for the
Next.js, Vite, and Electron watchers running at once. `inotify_init` reports
exhaustion as `EMFILE`, which surfaces as a misleading
`TurbopackInternalError: Too many open files (os error 24)` — misleading because
`ulimit -n` is already high enough and is not the limit being hit:

```bash
echo 'fs.inotify.max_user_instances=1024' | sudo tee /etc/sysctl.d/99-superset-inotify.conf
sudo sysctl --system
```

**Enough swap to run the whole stack.** `bun run dev` starts three Next.js/Turbopack
servers plus Vite plus Electron, which together hold several GiB of anonymous
memory. The kernel can only reclaim that if there is somewhere to page it out, so a
small swapfile stalls the machine under memory pressure even with RAM free — on a
15 GiB box with a 512 MiB swapfile this killed the dev servers mid-build, with no
kernel OOM kill in `dmesg` to explain it. 6 GiB is comfortable:

```bash
sudo swapoff /swapfile
sudo rm /swapfile
sudo fallocate -l 6G /swapfile   # on btrfs use dd and chattr +C instead
sudo chmod 600 /swapfile         # swapon refuses a world-readable swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Run those with the dev servers stopped: `swapoff` pages everything back into RAM
first. If `/etc/fstab` already lists `/swapfile`, resizing in place needs no edit
there. `bun run dev:desktop` (api + desktop, no web app) is the lighter alternative
if you would rather not grow swap.

**A setuid Electron sandbox helper**, after `bun install` has run. Electron ships
`chrome-sandbox` mode 755 owned by the installing user; Chromium requires it to be
root-owned and setuid, and aborts at startup rather than run unsandboxed. Ubuntu
24.04 and later also set `kernel.apparmor_restrict_unprivileged_userns=1`, which
blocks the namespace sandbox Electron would otherwise fall back to, so fixing the
binary is the fix. Do not pass `--no-sandbox` instead — that disables the renderer
sandbox for the whole dev app:

```bash
sandbox="$(find node_modules -path '*electron/dist/chrome-sandbox' | head -1)"
sudo chown root:root "$sandbox"
sudo chmod 4755 "$sandbox"
```

This lives in `node_modules`, so reinstalling or bumping Electron resets it and you
run those three lines again.

## Run it from a Superset workspace

```bash
git clone https://github.com/superset-sh/superset.git
```

Add the clone to the installed Superset app and create a workspace for your
change. Superset creates that workspace as an isolated git worktree. In the new
workspace terminal, run:

```bash
./.superset/setup.local.sh
bun run dev
```

Run `setup.local.sh` separately in every new worktree before `bun run dev`. The
setup and workspace-specific app identity allow the development desktop app to
run alongside the installed Superset app and development apps from other
worktrees.

**You do not need a Neon account, Stripe keys, or any other third-party
credentials.** `.env.local.example` ships fake placeholders that pass env
validation, and `setup.local.sh` runs everything against a local Docker stack.

### What `setup.local.sh` does

1. Copies `.env.local.example` → `.env`
2. Allocates a per-workspace port range so multiple worktrees don't collide
3. Brings up Postgres + neon-proxy + Redis (behind an HTTP shim, for the relay) via `docker compose` (project-scoped to this worktree)
4. Runs `bun install` and `bun run db:migrate`
5. Seeds a `Local Admin` dev account via `bun run db:seed-dev`
6. Writes a gitignored `.superset/config.local.json` overlay so subsequent worktrees automatically use this setup

Re-run the script any time to refresh the workspace. To tear the local DB stack down:

```bash
./.superset/teardown.local.sh
```

### Signing in

After `bun run dev`, open the web app and click the **"Sign in as dev"** button on the sign-in page (also available in the desktop sign-in screen). Or use the credentials directly:

- Email: `admin@local.test`
- Password: `supersetdev`

The dev sign-in button and email/password auth are gated on `NODE_ENV=development`. They don't ship in production.

## Manual setup (advanced)

If you need to point at real Neon / third-party services instead of the local Docker stack:

```bash
cp .env.example .env             # fill in real Neon, Stripe, etc. credentials
bun install
bun run dev
```

## Building the desktop app

```bash
bun run build
open apps/desktop/release
```

## Common commands

```bash
bun dev                # Start the api, web, and desktop dev servers
bun run dev:all        # Start every dev server in the monorepo
bun test               # Run tests
bun run lint:fix       # Fix lint + format
bun run typecheck      # Type-check all packages
bun run check:i18n     # Regenerate and audit translation catalogs
bun run build          # Build the desktop app
```

See [`AGENTS.md`](./AGENTS.md) for repo structure, monorepo conventions, and database/migration workflow.

## Troubleshooting

- **Dev desktop exits while the installed app is running**: launch development
  from a Superset workspace instead of the repository's main checkout, run
  `./.superset/setup.local.sh` in that worktree, then run `bun run dev` again.
- **Port collision**: `setup.local.sh` allocates a fresh port window per worktree. If you ran the script before this change landed, re-run it to migrate.
- **DB connection errors after pulling main**: re-run `./.superset/setup.local.sh`; it's idempotent and will apply any new migrations.
- **Stuck Docker stack**: `./.superset/teardown.local.sh` then re-run setup.
- **Linux: build or startup fails in a way this list doesn't cover**: check [Linux prerequisites](#linux-prerequisites) first. `Too many open files`, `ConnectionRefused` against a healthy container, a `chrome-sandbox` abort, and dev servers dying mid-build all have Linux-specific causes documented there.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the PR process and code-of-conduct expectations.
