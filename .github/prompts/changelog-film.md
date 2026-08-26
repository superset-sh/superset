# Weekly changelog film SOP

How to produce the short demo film that rides with a weekly changelog entry: one clip
that walks the week's headline features in the real app. Companion to the Weekly
Changelog automation (Notion SOP is the source of truth for the entry itself) and to
`readme-hero-film.md`, which this adapts from a one-off marketing hero to a weekly cadence.

## What it is

A 20-40s captioned mp4 (not GIF: changelog MDX has a `<Video>` component with controls),
one beat per headline feature, 3-5 beats total, in changelog order. Every frame is real
app state driven over CDP; no mockups. Landscape 1280px wide, 30fps, silent.

## Cadence and scope

- Produced with the weekly changelog when the week has 2+ features that read better in
  motion (flows, dropdowns, live status). A slow week skips the film; never pad beats.
- The film demos the entry's own sections, top to bottom. One idea per beat, captioned
  in the entry's words, so the film and the entry never disagree.

## Production (adapts readme-hero-film.md; read that file for the deep recipes)

1. **Stage** the dev desktop from the worktree: `SUPERSET_HOME_DIR="$PWD/superset-dev-data"
   RENDERER_REMOTE_DEBUG_PORT=9222 bun run dev:desktop`, wait for `localhost:9222/json`.
2. **Hard rules carried over**: no real data in frame (demo projects only, hide Sessions,
   restore all state after), no PII, quit the dev stack when done.
3. **Frames over CDP**: `Emulation.setDeviceMetricsOverride` (1280x800, DPR 2), drive each
   beat with real interactions, `Page.captureScreenshot` at 8-12 fps bursts for motion
   (`Page.startScreencast` where the flow animates).
4. **Captions + backdrop**: composite each beat on the flat card backdrop (`card` mode
   look from `beautify-screenshot.ts`; heroes' bleed/fade not needed in motion), caption
   in Inter Medium, no em dashes, prose rules apply.
5. **Encode**: `ffmpeg -an -vf "scale=1280:-2,fps=30" -c:v libx264 -pix_fmt yuv420p
   -crf 28 -preset slow -movflags +faststart` into
   `apps/marketing/public/changelog/YYYY-MM-DD-week.mp4`; target under 2MB.
6. **Embed** at the top of the entry, right under the frontmatter:
   `<Video src="/changelog/YYYY-MM-DD-week.mp4" title="Everything in this week's release" />`
7. The launch thread's post 2 attaches this film.

## Status

Written 2026-08-24 on Kiet's ask ("the weekly video ... demoing everything"). Not yet run;
first production week should time-box beats to ~30 min each and cut what overruns.
