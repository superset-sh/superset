---
name: mobile-limrun-dev
description: Launch and iterate on apps/mobile from a cloud sandbox (no local Xcode or simulator) using Limrun's remote iOS simulators. Use when asked to run, start, open, or show the mobile app from a cloud workspace, or to verify a mobile change there. On a machine with real Xcode, use mobile-sim-verification instead.
---

# Mobile on a cloud sandbox (Limrun)

A cloud sandbox is Linux — no `xcrun`/`simctl`. `apps/mobile/scripts/limrun-dev.sh` is the one command
that gets the real dev-client app running on a Limrun cloud iOS simulator, connected to this sandbox's
own Metro and API. Run it:

```bash
apps/mobile/scripts/limrun-dev.sh
```

It reuses a shared build when one already exists for this branch (seconds, no Xcode sandbox at all) and
only builds when it has to. Pass `--rebuild` after changing a native dependency or native config (new
native module, Info.plist, entitlements), or `--force-prebuild` if an `EXPO_PUBLIC_*` value a *native*
config plugin reads (not a plain JS read) changed — see `apps/mobile/AGENTS.md`'s "Verifying in the real
app" section for exactly why each of those is needed. Don't re-derive any of this by hand; the script and
that doc are the record of what was actually discovered getting this working (2026-10-02), including two
dead ends (Limrun has no way to persist the Xcode sandbox-exec fix, confirmed by testing a disk-snapshot
restore; `.env` never reaches the remote build because it's gitignored).

The script prints a `console.limrun.com/stream/...` URL — share it as a Markdown link if the person asked
to see the app, not just to have it running.

After it finishes, drive the simulator with the `limrun-ios-simulator` skill (tap, type, screenshot,
element tree, logs) or `limrun-maestro-testing` for a Maestro flow. The script does not start `apps/relay`
or tunnel its port, so host/workspace presence features will show as unreachable until that's done too —
fine for auth/UI verification, not for anything host-dependent.

Needs `LIM_API_KEY` (usually already in `.env`) and this repo's `.env` already written
(`.superset/setup.sh` or `.superset/setup.cloud.sh`). A `400 cannot create an instance when organization
has no remaining credits` means the Limrun org needs credits or a subscription — check
console.limrun.com's billing page; there's no CLI command for this.
