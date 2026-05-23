---
source: ticket
improvement_id: GH-3572
ticket_id: GH-3572
ticket_url: https://github.com/superset-sh/superset/issues/3572
tracker: github
title: "[bug] Intermittent garbled text rendering with multiple Claude Code tabs and Chinese content"
labels: []
state: OPEN
fetched_at: 2026-05-22T00:00:00Z
related_pr: https://github.com/superset-sh/superset/pull/3924
related_issues: [3794, 3527, 3504, 3668, 3208, 3321, 2968, 1065, 3406, 3570]
upstream_refs:
  - https://github.com/xtermjs/xterm.js/issues/5816
  - https://github.com/xtermjs/xterm.js/pull/5883
---

# Brief (user-supplied investigation + GH context)

## User-supplied investigation (verbatim slack-style message)

> :bug: **Terminal pixelation — root cause + proposed remedy**
>
> The intermittent garbled-glyph rendering in our embedded terminals (text mangles into wrong glyphs, heals only on window/pane resize) is xterm.js WebGL **texture-atlas corruption** on macOS. Confirmed via DevTools: forcing `WEBGL_lose_context.loseContext()` on the affected canvas crashed the entire GPU process (white screen, Chromium "Aw, Snap!" reload) — the WebGL stack is genuinely wedged, not just stale state.
>
> Already tracked internally: https://github.com/superset-sh/superset/issues/3572 . The webgl team has shipped 5 partial fixes over the years; the most recent (#3924 "drop WebGL renderer in v1 terminal") disabled WebGL in *one* of the terminal call sites — two others still use it, which is why we're still hitting this on the workspace pane terminals.
>
> **What VSCode does** (canonical reference): NOT a blanket disable. In their `onContextLoss` handler they (a) dispose the WebGL addon for that terminal AND (b) set their suggested-renderer-type to "dom" **globally** so any subsequent terminals start on DOM instead of re-attempting WebGL. See https://github.com/microsoft/vscode/issues/120393 "fall back to dom if webgl loses context".
>
> **Our gap**: both `onContextLoss` handlers — in `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` and `.../Terminal/helpers.ts` — dispose the addon but skip the global flag, so every new tab keeps re-attempting WebGL. Exactly the root-cause noted in #3572.
>
> **Proposed PR** (small, defense-in-depth):
> - Add `suggestedRendererType = "dom"` to both `onContextLoss` handlers (VSCode pattern; helps every platform that hits a context-loss event).
> - On macOS, skip loading the WebGL addon entirely (completes #3924 for the two remaining call sites; sidesteps GPU-compositor instability since the corruption we observed can happen without a clean context-loss event firing first).
>
> Tradeoff: xterm's DOM renderer is slower than WebGL for very-high-throughput streaming, but the delta is invisible for normal terminal use in agentic-coding workflows. VSCode has shipped DOM fallback for years without complaints.

## Ground-truth evidence (already gathered)

- **Forced context-loss experiment**: `WEBGL_lose_context.loseContext()` against the affected canvas crashed the entire GPU process (Chromium "Aw, Snap!"). This rules out "stale state" — the WebGL stack is actually wedged. **Implication**: the existing `onContextLoss` handler may not always be the right trip-wire, because the corruption can occur without a clean context-loss event firing.
- **Visual symptom**: glyphs mangle into wrong glyphs; heals on window/pane resize (which forces a re-render path that re-initializes the WebGL atlas).
- **Repro pattern**: many Claude Code tabs open (~7–8), CJK content historically reported but **valentin-ib confirms** it reproduces without CJK too — CJK is a red herring, not a root cause.

## GH issue #3572 (key excerpts)

### Symptom (from issue body)
- ~7–8 Claude Code tabs simultaneously → text intermittently renders as garbled/corrupted characters in code blocks, diff views, and terminal output.
- Underlying data not corrupted (refresh/restart immediately restores rendering) → rendering-layer issue.
- macOS-specific reports dominate but workaround (window resize) suggests browser GPU-compositor state.

### Prior in-repo investigation (github-actions bot comment, 2026-04-19)
- Code-block/diff/shiki paths were exercised against CJK + concurrent calls — produced **correct output**. Bot concludes the rendering-layer corruption is NOT in shiki or diff code.
- Bot noted **the exact gap** the user identified: `onContextLoss` in `terminal-addons.ts` disposes the WebGL addon but does NOT set `suggestedRendererType = "dom"` globally, so subsequent terminals re-attempt WebGL. Under the browser's per-document WebGL context cap (~16), this cascades.
- Bot explicitly stated **no PR** because root cause "only manifest[s] in a real browser + GPU + many open tabs… can't be exercised from `bun:test`".

### Prior partial fix (PR #3924, merged 2026-05-01)
- Title: "fix(desktop): drop WebGL renderer in v1 terminal"
- Action: removed WebGL from v1 terminal path only.
- Explicit note: "v2 terminal (`renderer/lib/terminal/terminal-addons.ts`) is untouched — its shorter pane lifecycle hasn't surfaced the issue."
- Trade-off documented: DOM is slower under sustained heavy output, but corruption is the worse failure mode.
- **Gap**: assumption that v2's shorter pane lifecycle would not surface this proved wrong — users report v2 terminals still affected.

### Upstream xterm.js work
- xtermjs/xterm.js#5816 — texture-atlas corruption tracking issue
- xtermjs/xterm.js#5883 — proposed PR (status unknown at brief time)

### VSCode precedent
- Microsoft/vscode#120393 — VSCode's solution: dispose addon AND set global suggestedRendererType="dom" so subsequent terminals start DOM. Shipped years ago without user complaints.

## File call sites (per user)

- `apps/desktop/src/renderer/lib/terminal/terminal-addons.ts` — v2 terminal addon loader (handles `onContextLoss`)
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts` — second call site with its own `onContextLoss` handler

These two are the "two others still use WebGL" referenced by the user (v1 already migrated to DOM via #3924).

## Proposed remedy (user-supplied — for investigator to challenge/expand)

1. Add `suggestedRendererType = "dom"` to both `onContextLoss` handlers (VSCode pattern, cross-platform defense in depth).
2. On macOS specifically, skip loading WebGL addon entirely (matches #3924's intent, extended to remaining call sites; sidesteps the "no context-loss event fired" failure mode).

Trade-off documented by user: DOM is slower for high-throughput streaming; invisible for normal agentic-coding terminal use.
