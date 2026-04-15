# polished-renderer — Video Compositor for Screen Recordings

`polished-renderer` is a Rust-compiled native Node.js addon that handles the complete screen recording and video production pipeline. It decodes video, composites visual effects (keystroke overlays, cursor rendering, zoom/pan), and generates the final polished video artifacts.

---

## Quick Facts

| Property | Value |
|---|---|
| Binary | `/exec-daemon/polished-renderer.node` (5.9 MB) |
| Type | ELF shared object (`.node` native addon) |
| Language | Rust (napi-rs bindings for Node.js) |
| Source path | `packages/polished-renderer/src/` (Anysphere internal) |
| Node.js export | `renderFromPlanNative()` — single function |
| Key dependencies | ffmpeg/libav (video), resvg (SVG), tiny_skia (2D), font-kit (fonts) |

---

## Exported API

```javascript
const { renderFromPlanNative } = require('polished-renderer.node');

// Single function — renders a video from a plan JSON
renderFromPlanNative(/* arguments defined by NativeRenderOptions */);
```

The function takes a render plan (JSON) and produces a composited video file.

---

## Render Plan Schema

The renderer reads a `render-plan.json` file that defines the entire video composition. Key structures extracted from binary analysis:

### `RenderPlan` (top-level, 6 fields)
```
{
  video: { ... },          // Source video metadata
  tracks: { ... },         // Render tracks (overlays, effects)
  decisionInput: { ... },  // Speed/zoom decision inputs
  decisions: { ... },      // Applied decisions
  diagnostics: { ... },    // Errors and warnings
}
```

### `RenderTracks` (4 fields)
```
{
  clickEffects: [...],      // Click highlight animations
  keystrokeEvents: [...],   // Keyboard overlay events
  zoomWindows: [...],       // Zoom/pan keyframes
  cursorStyle: "...",       // Cursor rendering style
}
```

### `PlaybackSegment` (8 fields)
```
{
  sourceStartMs: number,    // Where to start in source video
  sourceEndMs: number,      // Where to end in source video
  outputStartMs: number,    // Where this appears in output
  outputEndMs: number,      // Where this ends in output
  playbackRate: number,     // Speed multiplier (e.g., 2.0 = 2x)
  speedOverride: { ... },   // Manual speed override
}
```

### `KeystrokeEvent` (5 fields)
```
{
  timeMs: number,           // When the keystroke occurred
  displayText: string,      // What to render (e.g., "⌘+S")
  displayDurationMs: number,// How long to show overlay
  eventType: string,        // Event classification
}
```

### `ZoomCandidate` (9 fields)
```
{
  candidateIndex: number,
  centerX: number,
  centerY: number,
  suggestedZoom: number,
  actionType: string,
  actionIndex: number,
  importanceScore: number,
  context: string,
}
```

### `CursorPath` (2 fields)
```
{
  style: string,            // Cursor visual style
  keyframes: [              // Position over time
    { timeMs, x, y, ... }
  ]
}
```

### `IdlePeriod` (7 fields)
```
{
  durationMs: number,
  classification: string,
  suggestedSpeed: number,
  precedingActionType: string,
  followingActionType: string,
}
```

---

## Video Processing Pipeline

### 1. Input Analysis
- Runs `ffprobe` to detect video codec, resolution, frame rate, duration
- Expects H.264 YUV420P input from screen recording
- Validates: `stream=codec_type,width,height,avg_frame_rate`

### 2. Proxy Generation
Creates intermediate H.264 proxies for efficient processing:

| Proxy | Resolution | Encoding | Purpose |
|---|---|---|---|
| `render_proxy_full` | Original size | H.264, all I-frames | Seeking, random access |
| `render_proxy_1080p` | 1920×(auto) | H.264, all I-frames | Scaled output |

ffmpeg encoding flags:
```
-x264-params keyint=1:min-keyint=1:scenecut=0:bframes=0
```
(All I-frames = every frame is a keyframe, enabling instant seeking at any point)

1080p scaling: `-vf scale=1920:-2:flags=lanczos` (lanczos resampling, auto-height)

Proxy metadata stored in `render-proxies.json`:
```json
{
  "renderProxies": [...],
  "generatedAtEpochMs": 1776278000000
}
```

### 3. Frame Decoding
- Uses ffmpeg's `avcodec` API (`avcodec_find_decoder`, `av_read_frame`, `avcodec_receive_frame`)
- Decodes into YUV420P frame buffers
- Multi-threaded: configurable via `POLISHED_RENDERER_DECODER_THREADS` env var

### 4. Compositing (per-frame)
For each output frame, the compositor applies:

1. **Playback segment mapping** — Maps output timestamp to source timestamp with speed adjustment
2. **Zoom/pan** — `apply_zoom_pan_i420_into()` — Applies zoom windows with smooth interpolation
3. **Camera motion blur** — `apply_camera_motion_blur_plane_into()` — Smooth camera transitions
4. **Cursor rendering** — Draws cursor SVG at tracked position (`cursor.svg` parsed via resvg)
5. **Click effects** — Highlights on mouse clicks (`ClickEffectKeyframe`: type, position, modifiers)
6. **Keystroke overlays** — Renders keyboard shortcut text on-screen

### 5. Keystroke Overlay Rendering
Font resolution priority:
1. SF Pro Text / SF Pro Display (macOS)
2. San Francisco, Helvetica Neue, Helvetica, Arial
3. Liberation Sans, DejaVu Sans
4. Noto Sans, Noto Sans Symbols2, Noto Sans Symbols
5. Segoe UI Symbol

If symbol glyphs (e.g., ⌘, ⇧, ⌥) are missing, degrades to ASCII representation with a warning.

### 6. Output
- Writes final composited video to `/opt/cursor/artifacts/`
- Records metadata in `recording-data.json`

---

## Concurrency & Locking

- **`render-proxies.lock`** — File lock for proxy generation (stale-lock detection with timeout)
- **`render-proxies.slow-path.json`** — Fallback metadata when lock is contended
- On-demand proxy generation if pre-computed proxies aren't available

---

## Error Handling

| Error | Behavior |
|---|---|
| ffprobe missing/invalid width/height | Reports specific error |
| Source video not H.264 | Reports "unexpected pixel format" |
| Proxy generation fails | Falls back to original video: "falling back to original video" |
| Full proxy needed but missing | Generates on demand |
| Font missing for keystroke overlay | Degrades to ASCII, warns about missing glyphs |
| Duration mismatch | Reports "Output fps mismatch" or "Output dimensions mismatch" |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `POLISHED_RENDERER_DECODER_THREADS` | Number of ffmpeg decoder threads |
| `RUST_MIN_STACK` | Minimum stack size for Rust threads |
