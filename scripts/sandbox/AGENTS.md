# Cloud workspace sandbox image

`image.ts` builds the image every cloud workspace runs. It ships
`packages/host-service/dist`, so **a host-service change is not live in a
sandbox until this is rebuilt** — that is the most common reason a fix "doesn't
work" in a cloud workspace while working locally.

```
bun run --cwd packages/host-service build:host      # the bundle the image ships
bun run --cwd packages/pty-daemon build:daemon
vercel vcr login docker --project <VERCEL_SANDBOX_PROJECT_ID> --scope <team>
bun run scripts/sandbox/image.ts                    # build linux/amd64, push to VCR
bun run scripts/sandbox/image.ts --dry              # print the Dockerfile only
```

The image lands in Vercel Container Registry under the `sandboxes` project;
`Sandbox.create({ image: "superset-hostsvc" })` resolves it by name. Docker
must be running; the registry login lasts 12 hours.

**Read `docs/cloud-sandbox-mismatches.md` before changing this image, and add to
it when you find a new mismatch.** Several entries are about this file: the
native-module pins (node-pty's prebuild links glibc, better-sqlite3 must match
host-service), and the agent CLIs' pre-seeded config, which exists because a
first run otherwise blocks on a theme picker, an API-key approval and a trust
dialog that no one is there to answer.

Two traps specific to the image:

- **A headless `claude -p` run proves nothing about the interactive TUI.** It
  writes none of the onboarding keys, so a smoke test passes while a real
  terminal still stops on three prompts.
- **The desktop group installs with recommends, and nothing in it is trimmed.**
  `DESKTOP_PACKAGES` is the whole reference list (screen recording, keyring,
  editor, input tools) plus the `xfce4` metapackage; `--no-install-recommends`
  once dropped the SVG pixbuf loader and every icon silently fell back. When a
  package list turns up, add all of it — image size is not the constraint.
- **host-service's natives must not compile at build time.** The image now
  carries a full toolchain for projects, so a missing node-pty prebuild would
  compile silently; the build asserts the prebuild exists instead.

**Tune the desktop on a live sandbox, then codify.** A build-push-release
round trip is ~20 minutes. The Vercel CLI reaches a running sandbox directly
(`--project sandboxes --scope superset-sh` on each):

```
vercel sandbox list
vercel sandbox exec <name> --timeout 30s -- sh -c '<command>'   # one command
vercel sandbox connect <name>                                  # interactive shell
vercel sandbox copy <name>:/tmp/display.png ./display.png      # files either way
```

`DISPLAY=:1 import -window root /tmp/display.png` in the sandbox plus `copy`
is a screenshot of the desktop. Edit config there, restart Plank or the panel,
look, repeat; only the settled result goes into `image.ts`. Two things that cost a rebuild each to learn: Plank reads its
preferences from GSettings (the `~/.config/plank/dock1/settings` file is
ignored; the image compiles a schema override), and it pairs a window with the
launcher whose desktop file is named after the window's class, so Chrome's
launcher has to be `google-chrome.desktop` itself.

`docs/cloud-sandbox-considerations.md` is the companion list: what we still owe
before a non-internal user can create a sandbox. Several entries there are only
acceptable because of the `@superset.sh` gate — if you touch that gate, read it.
