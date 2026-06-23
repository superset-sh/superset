<!-- LOCAL-ONLY handoff (do not commit upstream). Working notes for the
     "work on multiple platforms/workspaces simultaneously" thread. -->

# Superset — Multi-Workspace / Multi-Platform Handoff

**Date:** 2026-06-22
**Repo:** `superset-sh/superset` (cloned here, `main`).
**Author of the driving issue:** you (`ashbrener`).
**Purpose:** carry forward the "run multiple Superset platforms/workspaces at the
same time" work — both the **local launcher workaround** (usable today) and the
**upstream PR consideration**. Spun out of a Wingman session so that work can stay
focused; this file is the full context.

---

## 1. The goal

Work on **multiple platforms simultaneously**, each = a group of repos, kept
isolated (separate window/monitor, ideally distinguishable at a glance). Today
Superset is single-instance, so you can't have two platform contexts open at once.

This is your GitHub issue **#4018** — *"[feat] Add a platform-level layer above
Project to group multiple repos"* (label: enhancement, OPEN). It proposes three
solutions, biggest-impact → cheapest:

1. **Project groups/folders within an org** (your *preferred*) — a layer above
   Project grouping repos under a named parent ("Platform A"), collapsible in the
   V2 sidebar (like workspace sections in #2067); ideally per-group env / MCP /
   agent presets / automations.
2. **Multiple personal orgs on the free tier** — org-per-platform (a workaround;
   per-org Electric SQL collections already exist).
3. **Per-window organization context** — multiple Superset windows each holding a
   different active org, one per monitor. *(This is the cheapest slice and the one
   the launcher workaround approximates.)*

Side note from the issue: "Workspace" in Superset = one branch's worktree (smaller
than the usual meaning); renaming to "Branch"/"Worktree" and reserving "Workspace"
for the larger grouping concept would clarify the hierarchy.

---

## 2. App facts (verified)

- App: `/Applications/Superset.app` · bundle id `com.superset.desktop` · **Electron**.
- `LSMultipleInstancesProhibited` is **not** set (macOS won't block a 2nd instance).
- All session/state lives in **one** dir: `~/Library/Application Support/Superset`
  (~3.4 GB). This is the Electron `userData`.
- **Single-instance lock** is the reason you can't open two:
  - `apps/desktop/src/main/index.ts:326` → `const gotTheLock = app.requestSingleInstanceLock()`
  - `apps/desktop/src/main/index.ts:332` → `app.on("second-instance", …)` focuses the
    existing window instead of opening a new one (window-focus logic ~lines 100-120).
  - `apps/desktop/src/lib/electron-app/factories/app/instance.ts` → helper
    `makeAppWithSingleInstanceLock(fn)` (quits if not primary).
- The lock is keyed to the `userData` dir, so a **different `--user-data-dir` =
  different lock = a genuinely separate instance.** That's what makes the
  workaround below work.

---

## 3. Workaround you can use TODAY — colored launcher apps

One small launcher `.app` per platform, each pinned to its own profile dir + its
own Dock icon. Runs multiple instances at once; each is an isolated session.

```bash
make_superset_launcher() {           # usage: make_superset_launcher "Frontend"
  local name="$1"
  local dir="$HOME/Library/Application Support/Superset-$name"
  osacompile -o "$HOME/Applications/Superset $name.app" \
    -e "do shell script \"open -n -a Superset --args --user-data-dir='$dir'\""
  echo "Created: ~/Applications/Superset $name.app  (profile: $dir)"
}
make_superset_launcher "Frontend"
make_superset_launcher "Backend"
```

Then drag each from `~/Applications` to the Dock.

- **Colored icons** (to know which platform you're in): Finder → select the launcher
  → Get Info → drag a colored image onto the icon in the top-left. (Or auto-generate
  tinted `.icns` with ImageMagick/PIL if installed.)
- **Quick one-off** (no launcher): `open -n -a Superset --args --user-data-dir="$HOME/Library/Application Support/Superset-X"`
- ⚠️ **One rule:** each *concurrent* instance MUST use its own `--user-data-dir`.
  Two running instances on the same dir corrupt the state DB.
- Note: each profile is a separate local login to your Superset account; isolation
  is per-instance/window. Good enough to have N platforms open on N monitors now.

---

## 4. Upstream PR consideration

**Can you contribute?** Yes.
- **License:** Elastic License 2.0 (ELv2) — source-available; explicitly grants
  *derivative works*, so fork → PR is permitted. No CLA found.
- **CONTRIBUTING.md:** "discuss the change via an issue first." ✅ Done — #4018 exists.
  For the multi-instance slice, drop a comment on #4018 (or a focused new issue)
  to get a maintainer nod before building, since it's a commercial product.
- PR process: fork → PR (standard).

**Scoping by #4018 option:**

| Option | Effort | Where it lives / why |
|---|---|---|
| **#3 per-window org context** | **Small–Medium** | The lever is the single-instance lock (`main/index.ts:326/332`). Two flavors: (a) **relax/flag the lock** so multiple processes can run — ~5-10 lines, but each process still needs its own `--user-data-dir` or it corrupts state (footgun unless paired); (b) **proper**: a "New Window" that opens another `BrowserWindow` with a *different active org/context* in the **same** process — cleaner UX, but requires the renderer's active-org/state to become **per-window** (find where active org is held — likely a global store — and key it by window/session id). |
| **#1 project groups/folders** (preferred) | **Large** | Data model (`organizationId` threads through `apps/api/src/trpc/context.ts`, `apps/electric-proxy/src/index.ts`, `apps/web/src/app/workspaces/`), new sidebar grouping UI (model on #2067 workspace sections), optional per-group config. Needs maintainer alignment first. |
| **#2 multiple personal orgs** | Backend/tier policy | Mostly not yours to change (org = teams/billing). |

**Recommendation:** the realistic, high-ROI self-PR is **option 3, flavor (b)** —
native multiple-windows-with-distinct-context — because it directly unblocks the
real goal and is localized to the desktop app + renderer state. Flavor (a)
(unlock the single-instance lock behind a setting) is a trivial first step / proof
of concept and could ship as "allow multiple instances (advanced)". The full
platform-grouping feature (#1) is a genuine product feature — pursue only with
maintainer buy-in on #4018.

---

## 5. Concrete next steps (for a session opened in THIS repo)

1. Read the lock + window setup end-to-end:
   - `apps/desktop/src/main/index.ts` (lines ~320-443: lock, `second-instance`,
     `makeAppSetup(() => MainWindow())`).
   - `apps/desktop/src/lib/electron-app/factories/app/setup.ts` (window/activate).
   - `apps/desktop/src/lib/electron-app/factories/app/instance.ts`.
2. Find where the **active organization/context** is stored in the renderer
   (search `organizationId`, the org store/provider). Decide if it can be made
   per-window — that's the crux of option 3(b).
3. Prototype 3(a) first (gate `requestSingleInstanceLock()` behind a setting/env,
   require a per-instance `--user-data-dir`) to validate parallel windows; then
   decide whether to invest in 3(b).
4. Comment on **#4018** with the chosen slice + approach to get a maintainer nod
   before a big PR. Fork → branch → PR.
5. Build/run the desktop app locally per `CONTRIBUTING.md` / `apps/desktop` README
   to test multi-instance behavior.

## 6. Key files / pointers
- Lock: `apps/desktop/src/main/index.ts:326`, `:332`; `apps/desktop/src/lib/electron-app/factories/app/instance.ts`
- Org/context model: `apps/api/src/trpc/context.ts`, `apps/electric-proxy/src/index.ts`, `apps/web/src/app/workspaces/page.tsx`
- Sidebar sections precedent: issue **#2067**
- Driving issue: **#4018** (yours)
- License: `LICENSE.md` (ELv2) · Contributing: `CONTRIBUTING.md` (discuss-first, fork→PR)
