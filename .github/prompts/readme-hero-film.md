# README hero film SOP

How the animated README hero (`apps/marketing/public/images/readme-hero.gif`) is produced,
and how to re-cut or extend it. First shipped in PR #6397. Read this before touching the hero.

## What it is

A ~29s looping GIF, eight captioned beats, each composited on a hue of the site's
dithered-shader backdrop (ember → flame → indigo → violet → moss → ember → flame → indigo):

1. Describe the task (home prompt dispatch)
2. Agents build in parallel, each in its own worktree (split panes)
3. Monitor every agent from one place (workspace hop)
4. Put the recurring work on a schedule (Automations page)
5. Dispatch from your terminal (superset CLI via vhs)
6. Or let your agent orchestrate its own swarm (Claude running superset CLI)
7. Review the diffs (full-width diff viewer)
8. Comment on a line, your agent takes it from there (diff line comment → live session)

Every frame is real app state: real dispatch, real Claude/Codex/OpenCode sessions, real
Automations rows created through the API (deleted after), a real line comment sent to a
live session. No mockups.

## Hard rules

- **No real data in frame.** Swap the sidebar to demo projects (snapshot + restore
  `v2SidebarProjects` placements), hide the Sessions section, DOM-hide real Automations rows,
  pre-dismiss setup cards per project. Verify restoration after.
- **No PII.** A comment sent with no running agent session spawns a NEW session whose splash
  greets the user by name. Always target an existing session for beat 8.
- **No em dashes in captions.** Font is Inter Medium ~54px on a 1760x1200 canvas.
- **File budget: under 10MB** (GitHub stops rendering GIFs above it). 1280px @ 8fps,
  192 colors fits ~29s. Check size before pushing.
- Demo agents run `npm install`/builds unprompted: bake `.gitignore`
  (node_modules/.next/package-lock) into demo repos before any agent runs.

## Pipeline (capture)

Staging and capture recipes live in the team memory doc for dev-desktop CDP driving; the
short version:

1. `RENDERER_REMOTE_DEBUG_PORT=<port> bun run dev:desktop`, verify the port owner is your
   worktree's Electron.
2. **After boot** silence the agent notify-hook debug echoes (dev mode prints
   `[notify-hook] …` lines into TUI panes; the file is rewritten on every app launch):
   insert `DEBUG_HOOKS_ENABLED="0"` in `superset-dev-data/hooks/notify.sh`. Revert after.
3. Stage demo org over CDP: host-service `project.create` (importLocal of /tmp demo repos
   with bare-clone remotes), swap `v2SidebarProjects` placements, `workspaces.create` with
   `agents:[…]` for real sessions, `apiTrpcClient.automation.create` for demo automations.
4. Size the window with `window.resizeTo(1280, 800)` (2x DPR gives 2560x1600 sources).
5. Capture scene bursts at 10fps via CDP `Page.captureScreenshot` loops. Verify frames
   differ (`cmp` first vs last) before trusting a take.
6. CLI beat: vhs with a sandboxed `superset` shim (PATH-scoped to the dev instance via
   `superset-dev-data/zsh/.zshrc`; never run the real CLI against a prod org for demos).
   vhs mp4 output can fail; use `.gif` output and resample with `fps=10`.

## Pipeline (assembly)

All in ffmpeg + Pillow (this repo's ffmpeg has no drawtext; render caption strips as
transparent PNGs with Pillow):

1. Backdrops: backdrop-only variant of `beautify-screenshot.ts`'s shader HTML
   (paper-shaders ShaderMount, warp shape, per-beat hue, ~0.3 opacity, lightened vignette)
   screenshot by headless Chrome with `--enable-unsafe-swiftshader`. The `file://` URL must
   be ABSOLUTE or Chrome silently screenshots an error page that looks like a dark gradient.
2. Curate frames per beat (2x-speed typing via every-other-frame, hold payoff frames).
3. Per beat: window scaled to 1480x925, rounded corners via a Pillow-rendered alpha mask +
   `alphamerge` (per-pixel `geq` is minutes-slow), overlay at (140,92) on the 1760x1200
   backdrop, caption PNG overlaid with `enable=between(t,…)`. Always pass `-t <dur>` —
   looped PNG inputs otherwise never end the encode.
4. Chain beats with `xfade=fade:duration=0.4`, offsets cumulative minus fade.
5. GIF: `fps=8,scale=1280:-1` + `palettegen max_colors=192` + `paletteuse bayer`.

## Teardown checklist

- Kill demo agent processes (match by `lsof -d cwd` under demo worktrees, never by name).
- Commit dirty demo worktrees, `workspaceCleanup.destroy` each, `project.remove` both.
- Delete demo automations via API.
- Restore sidebar placements from snapshot; verify visually.
- Revert notify-hook edit and any zsh PATH lines; remove CLI shims.
- Stop the dev stack, kill orphaned Electron pids, confirm ports free.
