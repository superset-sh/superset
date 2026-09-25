---
name: mobile-demo-film
description: Turn mobile screen recordings into a configurable demo video with phone footage, title cards, cutaways, and an end card. Use when asked to edit a mobile feature demo or launch clip. Use mobile-demo-record to capture real app footage first.
---

# Mobile demo film

Use this skill to edit a new demo from real app recordings. The bundled renderer produces
silent video with configurable dimensions, frame rate, framing, and fades. Defaults are
1080x1920 at 30fps, with a phone frame on a warm paper backdrop. A useful default
is one feature in 20 to 40 seconds; adapt the story and pacing to the request.

## Prerequisites

Use Python 3.10+, Pillow 10.1+, and ffmpeg (including ffprobe and libx264). Recording with
`mobile-demo-record` needs macOS; editing existing footage does not. Font discovery tries
macOS system fonts, then Linux DejaVu fonts, then Pillow’s fallback. Specify font files for
consistent typography across machines. Install Pillow in a scratch virtual environment:

```bash
python3 -m venv <scratch>/film-venv
<scratch>/film-venv/bin/pip install "Pillow>=10.1"
```

Use that environment's Python for the commands below. Commands assume the repo root as
working directory. Output directories are created automatically. Existing outputs are
overwritten; source assets and the composition spec cannot be used as the film output.

## Workflow

1. **Plan one story.** Write a short table of on-screen actions and durations. Start with
   the user's action, show the app responding, and end on the visible result. A tour can
   start with the finished artifact instead. Verify the feature works before filming it.
2. **Capture real footage** with `mobile-demo-record`. Use demo data and a separate take
   for each beat. If the story needs an agent doing work, use a working host and agent.
   Capture desktop cutaways with `cdp-verification` when needed.
3. **Normalize before choosing cuts.** Simulator recordings have variable frame rates:
   `python3 .agents/skills/mobile-demo-film/scripts/film.py normalize raw/01.mov cfr/01.mp4`.
   Choose start/end timestamps from this constant-rate copy. Add `--fps 24` for a 24fps
   project (the default is 30).
4. **Compose** using a JSON spec beside the recordings:
   `python3 .agents/skills/mobile-demo-film/scripts/film.py compose <scratch>/film.json`.
5. **Review** a contact sheet and play the entire film:
   `python3 .agents/skills/mobile-demo-film/scripts/film.py sheet <scratch>/film.mp4 <scratch>/sheet.jpg`.
   Add `--frames 12 --height 480` to customize sampling and thumbnail height.
   By default, the sheet samples eight frames; inspect transitions and typing in playback too. Check
   for clipped text, unreadable UI, private information, spinners, and unintended clock changes.
6. **Deliver** the film and identify the build, environment, staged data, and omitted steps.
   Draft accompanying post copy only if requested; publishing needs user authorization.

Keep typing and reading at a natural pace. Trim or speed up waiting, and make time jumps
clear. Use title cards to explain missing context rather than implying an unrecorded action
happened in the app. Framing, masks, and the simulated Dynamic Island are presentation layers;
do not fabricate app state inside the recording.

## Composition spec

This example combines phone footage, a desktop cutaway, a result, and an end card. Replace
its paths, cut points, and text for the feature being demonstrated.

```json
{
  "output": "film.mp4",
  "backdrop": "#F2F0EB",
  "segments": [
    { "type": "phone", "src": "cfr/01.mp4", "start": 1, "end": 7, "label": "Start on your phone" },
    { "type": "card", "eyebrow": "Meanwhile", "title": "The agent works on your Mac.",
      "image": "shots/desktop.png", "duration": 4 },
    { "type": "phone", "src": "cfr/02.mp4", "start": 0, "end": 10 },
    { "type": "end", "wordmark": "Superset", "caption": "Review the result anywhere", "duration": 2.2 }
  ]
}
```

Media, output, and optional `titleFont`/`sansFont` paths resolve relative to the spec file;
absolute paths also work. Top-level `backdrop`, `bezel`, `ink`, and `muted` accept `#RRGGBB`.

### Output and framing

Add a `render` object to the spec. Existing specs without it keep the portrait defaults.
For a landscape demo:

```json
"render": {
  "width": 1920,
  "height": 1080,
  "fps": 24,
  "crf": 18,
  "fade": 0.2,
  "phone_width": 0.45,
  "phone_height": 0.8,
  "bezel_width": 0.012,
  "corner_radius": 0.1
}
```

For a square clip, use `"width": 1080, "height": 1080`. Cards and typography scale with the
canvas; the centered phone fits both width and height limits while preserving source aspect
ratio. Use `raw` for unframed desktop footage.

| Render option | Meaning and default |
| --- | --- |
| `width`, `height` | Canvas pixels; even integers at least 64. Defaults: 1080, 1920 |
| `fps` | Integer 1–120; default 30 |
| `crf` | Final H.264 quality, 0–51; lower means higher quality/larger files. Default 18 |
| `fade` | Fade duration in seconds; 0 disables fades. Default 0.35; capped at half each framed/still segment’s duration; raw clips have no fade |
| `phone_width`, `phone_height` | Maximum screen width/height as fractions of canvas dimensions, greater than 0 and at most 0.95. Defaults: 0.615, 0.82 |
| `bezel_width` | Border thickness as a fraction of the smaller canvas dimension, 0–0.25. Default 0.015 |
| `corner_radius` | Screen corner radius as a fraction of screen width, 0–0.25. Default 0.137 |

### Segments

| Segment | Fields |
| --- | --- |
| `phone` | `src`, optional `start`/`end` in seconds, `speed` (default 1), `label`, `island` (false disables the overlay) |
| `raw` | `src`, optional `start`/`end`, `speed`; unframed footage fitted to the output canvas with black padding |
| `card` | `title`, optional `eyebrow`, `caption`, `image`, `footer`, `duration` (default 4 seconds) |
| `end` | `wordmark` or transparent PNG `logo`, optional `caption`, `duration` (default 2.2 seconds) |

Keep cut points within the source duration and speed positive. Every segment must last at
least one output frame. The renderer validates all segments and source paths before encoding. Card titles wrap; captions, labels, and footers should be short. The
renderer removes audio, so use another editing workflow if narration or app audio is needed.

Store raw takes, specs, and finished films in a scratch directory. Share the inputs and spec
when teammates need to re-edit a particular demo; they are not required to create a new one.

## Reusing and checking the renderer

Run `film.py --help` or a subcommand with `--help` for CLI options. The Python module can
also be imported: `normalize(src, dst, fps=30)`, `compose(spec_path)` (returns the output
`Path`), and `sheet(src, dst, frames=8, height=900)` work without invoking the CLI.
`RenderSettings` holds layout calculations without mutable global canvas settings.

After editing the renderer, run its focused tests (requires ffmpeg and Pillow):

```bash
python3 -B -m unittest discover -s .agents/skills/mobile-demo-film/scripts -p 'test_*.py'
```

These render small portrait, landscape, and square compositions, check output dimensions,
frame rate and duration, and exercise invalid specs. Also inspect a contact sheet at the
intended delivery size; automated checks do not judge readability or composition.
