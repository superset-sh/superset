# Cloud workspace sandbox image

`image.ts` builds the image every cloud workspace runs. It ships
`packages/host-service/dist`, so **a host-service change is not live in a
sandbox until this is rebuilt** — that is the most common reason a fix "doesn't
work" in a cloud workspace while working locally.

```
bun run --cwd packages/host-service build:host      # the bundle the image ships
BL_API_KEY=… BL_WORKSPACE=… bun run scripts/sandbox/image.ts
bun run scripts/sandbox/image.ts --dry              # print the Dockerfile only
```

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
- **Nothing may compile at build time.** The image deliberately has no
  build-essential/python3; the build asserts node-pty's prebuild exists rather
  than letting a source build sneak in and add ~315 MiB.

`docs/cloud-sandbox-considerations.md` is the companion list: what we still owe
before a non-internal user can create a sandbox. Several entries there are only
acceptable because of the `@superset.sh` gate — if you touch that gate, read it.
