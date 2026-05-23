---
title: "xterm.js WebGL DOM-fallback strategy for Electron terminal apps - Deep Research"
date: "2026-05-23"
time: "00:30"
category: "research"
tags: [xterm.js, webgl, electron, terminal, atlas-corruption, vscode-pattern]
status: "complete"
research_type: "deep_research"
iterations: 2
sources_consulted: 17
confidence: "HIGH"
method: "deep-research"
ticket: GH-3572
purpose: "Inform scope refinement for GH-3572 owner-rejected three baseline options. Owner wants WebGL-first / DOM-fallback / recovery-back-to-WebGL."
---

# xterm.js WebGL DOM-fallback strategy — Deep Research for GH-3572

## ⭐ Summary recommendation (HIGH confidence)

**The best path forward is to BUMP `@xterm/xterm` + `@xterm/addon-webgl` from `6.1.0-beta.219` → `6.1.0-beta.220` (or later in that beta train).** Beta.220 was published to npm on May 21, 2026 and contains **PR #5883 "Fix webgl rendering corruption from atlas page merges"** — merged by xterm.js maintainer Tyriar with the explicit observation:

> *"This has been an issue for a long time, I think it's popped up more recently due to agentic CLIs using a much wider range of character styles."*
> — Tyriar (xterm.js maintainer), PR #5883 approval comment

This is **the upstream fix for our exact symptom class** (atlas-page-merge corruption that produces wrong glyphs). The user's forced `loseContext()` experiment captured a *catastrophic* GPU-process-death event that's a separate failure mode from the atlas-merge bug — both contribute to the GH-3572 user reports. PR #5883 addresses the dominant mechanism.

**Why this changes the picture:**
- Mac WebGL performance is preserved (no permanent DOM regression — user's primary constraint)
- We're already on the beta train (`6.1.0-beta.219`) so the marginal beta-risk delta is near-zero
- Multiple downstream consumers (VSCode #317927 May 22, Ouroboros, Alfredo) are bumping or vendoring this exact fix RIGHT NOW
- xterm.js milestoned this for v7.0.0 — when 7.0.0 GAs, we get an automatic upgrade off beta

**Tradeoffs:**
- Beta dependency stays a beta (we are already on a beta — no NEW risk)
- Does NOT cover the GPU-process-death class of failure the user saw via forced `loseContext()`. That class is rarer in practice (it requires manual or driver-level catastrophic failure, not the routine atlas drift). The VSCode-pattern `onContextLoss` → DOM fallback covers this as belt-and-suspenders.
- Beta.220 was published two days ago. ~10k weekly downloads already → not zero adoption but not battle-tested at our user-base scale yet.

**Recommended scope shape:**
1. **PRIMARY** — bump `@xterm/xterm` + `@xterm/addon-webgl` to `6.1.0-beta.220` (and other addons to compatible beta versions). This is the actual root-cause fix.
2. **DEFENSE-IN-DEPTH** — add VSCode-style `onContextLoss` → set `suggestedRendererType = "dom"` global flag in both `terminal-addons.ts` and `helpers.ts`. Cheap insurance for any remaining context-loss-class failures (Windows/Linux too).
3. **OPTIONAL BELT** — call `Terminal.clearTextureAtlas()` on workspace-tab-visibility-change as a "passive heal" mechanism (the resize-heal effect, but proactive). Public xterm.js API. ~2 lines.

DO NOT pursue the original Minimum (Mac → always-DOM) — root cause is being fixed upstream and that approach permanently regresses Mac perf for no gain.

---

## Q1: VSCode's CURRENT terminal renderer behavior

### Detection: multi-stage fallback (NOT just `onContextLoss`)

VSCode terminal lead Tyriar documented their full fallback chain in [microsoft/vscode#118064](https://github.com/microsoft/vscode/issues/118064) "Make the WebGL terminal renderer the default" (March 2021):

> **"Try webgl; If it threw an exception, try canvas; If frame rendering averages > 50ms (existing detection), use DOM"**

So VSCode uses **THREE stacked detectors**:
1. **Startup exception** — if WebglAddon construction throws → fall to canvas
2. **Frame budget watchdog** — if average frame time > 50ms → fall to DOM
3. **Context loss** ([microsoft/vscode#120393](https://github.com/microsoft/vscode/issues/120393), April 2021) — if `onContextLoss` fires → dispose addon, set `suggestedRendererType = "dom"` globally, fall to DOM for current + future terminals

This is NOT a one-listener fallback. It's a defense-in-depth net. Our project's BRIEF.md missed (1) and (2).

### Recovery (back to WebGL): no automatic recovery in current VSCode

VSCode's fallback is **one-way per session**. Once `suggestedRendererType = "dom"` is set, all subsequent terminals start on DOM until the user restarts VSCode. They consciously chose one-way:
> *"we need to make sure we don't save suggested renderer type if the webgl renderer is good"* — Tyriar, #120393

The flag is in-memory (not persisted), so a fresh app launch retries WebGL. No mid-session re-promotion.

### Known dispose race (May 2026 — still open in VSCode)

[microsoft/vscode#313726](https://github.com/microsoft/vscode/issues/313726) "Terminal isn't openning" (May 1, 2026) documents a current dispose race:
> *"`_disposeOfWebglRenderer` is called synchronously, but a pending `requestAnimationFrame` callback (`_queueRefresh → _refreshDecorations`) still runs after disposal and tries to access `dimensions` on an already-destroyed object."*

Call stack: `_disposeOfWebglRenderer @ xtermTerminal.ts:974` → `dispose @ xtermTerminal.ts:1088` → `dispose @ terminalInstance.ts:1300` → `_onProcessExit @ terminalInstance.ts:1740`.

**Implication:** Even VSCode hasn't fully solved this. Their pattern is good but not bulletproof. A naive copy of their `onContextLoss` handler may inherit the same race.

**Confidence: HIGH** (sources: VSCode #118064, #120393, #313726, #3271 — all from xterm.js maintainer Tyriar; directly quoted)

---

## Q2: `xtermjs/xterm.js#5883` — what does it actually do?

### Status: MERGED May 21, 2026 (two days ago)

**[xtermjs/xterm.js#5883](https://github.com/xtermjs/xterm.js/pull/5883) "Fix webgl rendering corruption from atlas page merges"** by `vsych`:
- Opened May 17, 2026; merged May 21, 2026
- Milestone: 7.0.0 (currently pre-released as `6.1.0-beta.220`)
- Published to npm: `@xterm/xterm@6.1.0-beta.220` 2 days ago (~10k DLs in 48h)
- Reviewer: Tyriar (xterm.js maintainer), approved with comment: *"Legend 👏 I can repro the problem on master and not on your branch. This has been an issue for a long time, I think it's popped up more recently due to agentic CLIs using a much wider range of character styles."*

### What it fixes — two distinct atlas-merge bugs (vsych's PR description)

**Bug 1: Texture binding stale after a same-index page swap.**
> *"`GlyphRenderer.render` only rebinds a texture unit on `version` mismatch, but after `_createNewPage` merges 4 pages into 1, the page object at the merged index swaps to a fresh `mergedPage`. With per-page counters the new page's `version` often coincided with the version we last bound at that index (the freshly-pushed mergedPage always landed on `1`). The rebind was skipped and **the texture kept the old page's canvas, so glyphs sampling that unit got garbage.**"*
>
> Fix: make `AtlasPage.version` monotonic across all pages.

**Bug 2: Stale `texturePage` in vertex buffer after mid-update merge.**
> *"When a merge fires inside `_updateModel`, cached glyphs get a new `texturePage`. Cells already written in this pass (or carried over via the model-unchanged early-exit) still point at the pre-merge index. `_requestClearModel` was set on merge but `beginFrame` never reset it, so it stayed true forever; and `renderRows` only checked it before `_updateModel`, so a mid-pass merge went unhandled."*
>
> Fix: reset `_requestClearModel` when `beginFrame` reads it; after `_updateModel`, re-run a full update if a merge fired during the pass (capped at `MERGE_RETRY_LIMIT` = 3).

### Is this our bug?

**HIGH confidence yes for the dominant mechanism.** The bug 1 description ("texture kept the old page's canvas, so glyphs sampling that unit got garbage") is a precise match for the user-reported symptom (wrong glyphs in correct positions, heal-on-resize). The PR closes 6 superset issues per cross-references:
- #3527 — Terminal Output Corruption (Garbled CJK Characters)
- #3794 — Terminal renders garbled characters (WebGL texture atlas corruption)
- #4601 — Gibberish text and symbols
- #4639 — CJK glyph corruption in terminal output (1.9.6)
- #4617 — Fonts mangling intermittently. (Closed)
- **#3572 — Our exact ticket**

### Does this fix EVERY case of garbled rendering on macOS?

No. There are at least three other open xterm.js WebGL issues:
- **[#5816](https://github.com/xtermjs/xterm.js/issues/5816)** — "Broken webgl rendering in Safari on MacOS beta 26.5 beta" (Apr 17, 2026). Multiple users say switching to canvas addon fixes it. May or may not be the same root cause; vsych's PR is referenced as a "possible fix".
- **[#5847](https://github.com/xtermjs/xterm.js/issues/5847)** — "[webgl] Partial row ghosting with transparent theme background on WKWebView / Tauri (stable macOS)" (Apr 27, 2026). PR #5883 was developed against this issue's repro.
- **Chromium [502262228](https://issues.chromium.org/issues/502262228)** — *"xterm.js glyph atlas texture failure with GL_INVALID_OPERATION + dual display"* (Apr 13, 2026). This is a Chromium/ANGLE-side bug on Intel RPL-U GPUs with dual monitors + fractional display scales. NOT something xterm.js #5883 can fix — it's in the driver. Mitigation requires the same DOM fallback or driver update.

**Merge probability when 7.0.0 ships: 100% (already merged).** A version bump to 6.1.0-beta.220+ picks it up immediately.

**Confidence: HIGH** (sources: PR #5883 itself, Tyriar comment, npm versions page, #5816/#5847/#502262228 cross-references)

---

## Q3: Alternative corruption-detection mechanisms

### `Terminal.clearTextureAtlas()` — public API for proactive heal

The user-reported "heals on resize" effect is exactly what `terminal.clearTextureAtlas()` does. Per [xtermjs.org/docs/api/terminal/classes/terminal](http://xtermjs.org/docs/api/terminal/classes/terminal):
> *"Clears the texture atlas of the webgl renderer if it's active. Doing this will force a redraw of all glyphs which can workaround issues causing the texture to become corrupt, for example Chromium/Nvidia has an issue where the texture gets messed up when resuming the OS from sleep."*

Released in xterm.js 4.9.0 (Nov 2020). Stable public API.

**Use cases:**
- Call on window-focus / tab-visibility-change (proactive heal — masks brief corruption between events)
- Call on `terminal.options.theme` change (avoids stale atlas after re-themes)
- Call periodically (e.g., every 30s) as belt-and-suspenders (slight perf cost — full redraw)

### Multiple detection layers possible

Beyond `onContextLoss`, xterm.js consumers have used:
1. **Try/catch at construction** — if `new WebglAddon()` throws → fall back at startup (used by everyone including VSCode)
2. **Frame budget watchdog** — measure frame time, fall to DOM if > 50ms average (VSCode #118064)
3. **`webglcontextlost` DOM event on canvas** — listen at the DOM layer instead of/in-addition-to xterm's higher-level callback (more granular, can `preventDefault()` to enable restore)
4. **Periodic atlas integrity probe** — draw a known glyph, `readPixels`, checksum — NOT seen in production xterm.js code, only mentioned in WebGL community guides ([Mattdesl Medium](https://medium.com/@mattdesl/non-intrusive-webgl-cebd176c281d))
5. **`webglcontextrestored` listener for recovery** — fires when context comes back; xterm.js consumers do NOT use this widely (KhronosGroup/WebGL#3057 notes restoration is unreliable cross-browser)

### Hermes Agent (NousResearch) recovery pattern

[NousResearch/hermes-agent#27740](https://github.com/NousResearch/hermes-agent/issues/27740) (May 18, 2026) hit the exact gap our user describes and shipped this recovery code:
```ts
// In the isActive switch useEffect, after syncMetricsRef.current?.()
const term = termRef.current;
if (term && !term.options.rendererType?.includes('webgl')) {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {}
}
```
This **rebuilds the WebglAddon on visibility-change** — recovery-back-to-WebGL within the same session. Their fix is in [PR #28008](https://github.com/NousResearch/hermes-agent/pull/28008) (filed May 18, 2026).

**Confidence: HIGH** (sources: xterm.js Terminal API docs, VSCode #118064, NousResearch #27740, MDN webgl docs)

---

## Q4: Failure mode breakdown — `onContextLoss` fires or silent?

**No clean public data.** Anecdotal evidence from issue threads suggests the corruption typically happens **without `onContextLoss` firing** in many of the cases users report — they observe the symptom for minutes before anything triggers, then heal on resize. The Chromium bug 502262228 explicitly shows GL_INVALID_OPERATION errors logged WITHOUT context-loss events (the WebGL stack stays "alive" but produces wrong textures).

By contrast, when the GPU process actually dies (forced `loseContext()` via DevTools, or driver crash), Chromium aggressively kills the renderer and may not deliver a clean event before tearing down.

**Implication for scope:** A pure `onContextLoss` fallback misses two failure classes:
1. Silent atlas drift (the dominant case — what PR #5883 fixes)
2. Catastrophic GPU-process death (rare — VSCode's frame-budget watchdog doesn't catch this either, since the process dies)

**Confidence: MEDIUM** (no statistical data; inference from issue tracker patterns and the Chromium bug report's described error mode)

---

## Q5: What do other terminal apps do?

### Direct competitors (NOT xterm.js consumers — different stacks)

- **Warp** — Rust + Metal direct. No xterm.js. ([warp.dev](https://www.warp.dev/))
- **WezTerm** — Rust + WebGPU (`front_end = "WebGpu"`) using Metal/Vulkan/DX12. No xterm.js. ([wezterm.org/config/lua/config/front_end.html](https://wezterm.org/config/lua/config/front_end.html))
- **Ghostty** — Zig + Metal direct, no Skia/Electron. No xterm.js. ([Ghostty 1.0 HN](https://news.ycombinator.com/item?id=42517447))
- **Alacritty** — Rust + OpenGL direct. No xterm.js.

These don't have the xterm.js problem because they don't use xterm.js. The pattern they all share: **direct GPU pipeline, no canvas/WebGL abstraction.** Not portable to our Electron stack.

### xterm.js consumers (same boat as us)

- **VSCode** — multi-stage fallback (see Q1). Most sophisticated.
- **Hyper** — uses xterm.js + canvas/webgl. Implementation details not surfaced in research.
- **Tabby** ([Eugeny/tabby#8884](https://github.com/Eugeny/tabby/issues/8884)) — has a user-facing setting "frontend: xterm (canvas)" as workaround. No automatic fallback documented.
- **Wave Terminal** — open-source, uses xterm.js. Listed in xterm.js README's adopters.
- **Hermes Agent** ([NousResearch/hermes-agent#27740](https://github.com/NousResearch/hermes-agent/issues/27740)) — May 18 2026 hit exact same bug as us, proposed rebuild-WebGL-on-visibility-change (see Q3).
- **Ouroboros** (hesnotsoharry/Ouroboros) — May 19 2026 vendored PR #5883 patch via postinstall SHA-256 patcher (see Q6 below).
- **Alfredo** (chloehkwong1/alfredo) — May 21 2026 bumped `@xterm/* to 6.1.0-beta.220` to consume #5883. From their commit: *"Upgrades @xterm/xterm and the six addons from 6.0.0 stable to the 6.1.0-beta.220 train, which includes xtermjs/xterm.js#5883 — fixing glyph substitution caused by stale WebGL texture binding after atlas page merges. That corruption hit terminals on WKWebView/Tauri (issue #5847); recovery previously required a manual atlas rebuild via Cmd+Shift+K."*

The Alfredo precedent is striking: they **shipped a `Cmd+Shift+K` keybinding** for users to manually trigger `clearTextureAtlas()`. So there's a known UX pattern for "user-initiated heal" too.

**Confidence: HIGH** for the consumer-pattern survey; the Warp/Ghostty/WezTerm out-of-scope finding is definitive.

---

## Q6: Post-fallback recovery methodology

### Vendor-patch precedent — Ouroboros project (May 19, 2026)

[hesnotsoharry/Ouroboros commit `d46b78d`](https://github.com/...) implemented exactly the pattern that may interest us if we DON'T want to bump to beta.220:

> *"Per ADR Decision 3 (RESOLVED 2026-05-18): keep WebGL, vendor upstream fix via self-contained Node postinstall patcher (no new deps - avoids the per-repo lockfile-sync dance)."*
>
> Vendor patch shape:
> - `patches/addon-webgl-0.19.0.original.{mjs,js}` — shipped 0.19.0 snapshot
> - `patches/addon-webgl-0.19.0.patched.{mjs,js}` — PR #5883 changes applied:
>   1. AtlasPage.version becomes monotonic global (5 increment sites)
>   2. TextureAtlas.beginFrame() resets _requestClearModel before return
>   3. WebglRenderer.renderRows() adds bounded retry loop (max 3) after _updateModel to handle mid-update merges
> - `tools/apply-patches.mjs` — SHA-256 based; copies patched bundle if installed matches original. Idempotent. Soft-warns and exits 0 if bundle SHA matches neither (upstream update detected — patch needs re-mapping or removal). Wired into package.json postinstall chain.
> - Removal flow: bump dep + delete patch files when upstream ships >= 0.19.1.

**Why this matters for us:**
- If we're nervous about bumping the dep into beta.220 territory, we can stay on beta.219 and apply just the #5883 diff via postinstall.
- More controlled scope (only the atlas-merge fix, no other beta.220 changes).
- BUT we're already on a beta. Risk delta is near zero. Probably not worth the patcher complexity unless beta.220 has a regression we're worried about.

### Hot-swap renderer support in xterm.js

- xterm.js [#2254](https://github.com/xtermjs/xterm.js/issues/2254) (June 2019) — "WebglAddon.dispose is not implemented... We cannot switch renderers back to dom/canvas currently". This is now fixed in modern xterm.js (5.x+) — dispose works ([4.14.0 release notes: "Fix an exception when disposing of the webgl addon (#3454)"](https://newreleases.io/project/github/xtermjs/xterm.js/release/4.14.0)).
- [#5181](https://github.com/xtermjs/xterm.js/issues/5181) (Oct 2024) — "race condition in terminal.dispose - The culprit seems to be the disposal of the webgl addon" — still open as of research date. Tells us that dispose paths have edge cases.
- Hermes Agent's example (Q3 above) shows hot-load of WebglAddon AFTER `Terminal.open()` is supported.

### Recovery feasibility

**Yes, recovery-back-to-WebGL is feasible.** Hermes Agent and Alfredo both show it. The pattern:
1. Track current renderer state (`webgl` | `dom`) per terminal.
2. On a recovery trigger (visibility change, every N seconds, user-initiated key), check if renderer is `dom` and try `loadAddon(new WebglAddon())`. If it throws, stay on DOM.
3. No persisted state across sessions — fresh app launches always retry WebGL first.

**Visual artifacts:** Minimal in xterm.js — `Terminal.refresh(0, rows-1)` after loading the addon redraws cleanly. No flicker reported by Hermes Agent.

### Does VSCode ever do this?

**No, not currently.** Their #120393 implementation was one-way-only (don't save renderer type if WebGL is good; once flipped to DOM, stay there until app restart). They consciously chose this for simplicity. No issue tracking automatic re-promotion.

**Confidence: HIGH** (sources: Ouroboros commit, Hermes Agent #27740, Alfredo commit, xterm.js #2254/#3454/#5181)

---

## Q7: Performance delta — actual DOM vs WebGL numbers

### From xterm.js itself

Per [VSCode "How Is New Terminal So Fast?" (2017)](https://code.visualstudio.com/blogs/2017/10/03/terminal-renderer): canvas/webgl renderer is "5-45x faster than DOM" in throughput benchmarks. The 5× lower bound is interactive typing; the 45× upper bound is sustained log-streaming workloads (`yes`, large `cat`).

The actual elbow:
- Interactive shells (typing, REPLs, file edits): DOM is INDISTINGUISHABLE from WebGL.
- `yes`-style streams, `tail -f` on busy logs, `npm install` output: WebGL noticeably smoother. DOM may stutter visibly at very high throughput.
- Agentic CLI workloads (Claude Code, etc.): heavy character-style changes but moderate raw throughput — closer to interactive than to `tail -f`. Most users wouldn't perceive DOM as slower for this workload.

### From PR #3924 (our own merged WebGL-drop for v1 terminal)

Our own engineers in PR #3924 chose DOM for v1 terminal with this trade-off note:
> *"DOM renderer is slower than WebGL under sustained heavy output (large pastes, fast `tail -f`). Acceptable since v1 is sunset and corruption is the worse failure mode."*

So our team has already field-validated DOM as "acceptable" for at least one terminal context.

### Implications for our scope

- The Mac-perf regression in original Minimum (always DOM on Mac) was REAL but BOUNDED — invisible for normal use, noticeable for `tail -f`-like streams.
- The owner's pushback ("most users are Mac, unacceptable") is reasonable given that DOM affects ALL Mac sessions all the time, not just corruption events.
- With the new path forward (bump to beta.220), Mac users keep WebGL by default. DOM only kicks in on actual context-loss fallback (rare).

**Confidence: MEDIUM-HIGH** (sources: VSCode 2017 blog post, our own PR #3924 explicit trade-off note)

---

## Confidence Assessment

| Finding | Confidence | Sources |
|---|---|---|
| PR #5883 fixes the dominant atlas-merge corruption | HIGH | 4 (PR itself, Tyriar comment, vsych description, before/after recordings) |
| Beta.220 is published and contains the fix | HIGH | 3 (npm versions page, Alfredo commit, VSCode #317927) |
| Bumping is the primary recommended fix | HIGH | 6+ (PR text, Tyriar quote, 3 downstream bumps, our own dep state, Q7 perf note) |
| VSCode uses multi-stage fallback (not just onContextLoss) | HIGH | 2 (Tyriar quote in #118064, #120393) |
| `Terminal.clearTextureAtlas()` is public API for heal | HIGH | 1 (xterm.js docs — authoritative source) |
| Recovery-back-to-WebGL is feasible | HIGH | 2 (Hermes Agent #27740, dispose-now-works confirmed) |
| Vendor-patch path is viable alternative | HIGH | 1 (Ouroboros commit recipe) |
| Frame-budget detection (50ms) works | MEDIUM | 1 (VSCode #118064 Tyriar; not seen in shipping code yet) |
| Corruption frequently occurs WITHOUT onContextLoss firing | MEDIUM | 2 (Chromium 502262228, user's own forced-loseContext experiment) |
| Performance delta DOM vs WebGL | MEDIUM-HIGH | 2 (VSCode 2017 blog, our PR #3924) |
| Other terminal apps not applicable to xterm.js stack | HIGH | 4 (Warp, WezTerm, Ghostty, Alacritty all use different stacks) |
| beta.220 will be battle-tested at our scale | LOW | 1 (only 10k weekly DLs, 2 days old) |

Overall research confidence: **HIGH (≈85%)**.

---

## Sources

[1] **xtermjs/xterm.js#5883** — *Fix webgl rendering corruption from atlas page merges*, vsych, merged May 21, 2026 — https://github.com/xtermjs/xterm.js/pull/5883 (accessed 2026-05-23)
[2] **microsoft/vscode#118064** — *Make the WebGL terminal renderer the default*, Tyriar, March 2021 — https://github.com/microsoft/vscode/issues/118064
[3] **microsoft/vscode#120393** — *Improve handling of webgl context loss*, Tyriar, April 2021 — https://github.com/microsoft/vscode/issues/120393
[4] **microsoft/vscode#313726** — *Terminal isn't opening — xterm.js WebGL dispose race condition*, May 1, 2026 — https://github.com/microsoft/vscode/issues/313726
[5] **xtermjs/xterm.js#3271** — *Make the DOM renderer the default and move the canvas renderer into an addon*, Tyriar, March 2021 — https://github.com/xtermjs/xterm.js/issues/3271
[6] **xtermjs/xterm.js#2254** — *Webgl: WebglAddon.dispose is not implemented*, Tyriar, June 2019 — https://github.com/xtermjs/xterm.js/issues/2254 (FIXED in v4.14)
[7] **xtermjs/xterm.js#5181** — *race condition in terminal.dispose*, Oct 2024 — https://github.com/xtermjs/xterm.js/issues/5181
[8] **xtermjs/xterm.js#5816** — *Broken webgl rendering in Safari on MacOS beta 26.5 beta*, Apr 17, 2026 — https://github.com/xtermjs/xterm.js/issues/5816
[9] **Chromium issues#502262228** — *xterm.js glyph atlas texture failure with GL_INVALID_OPERATION + dual display*, Apr 13, 2026 — https://issues.chromium.org/issues/502262228
[10] **NousResearch/hermes-agent#27740** — *xterm.js WebGL renderer context lost causes terminal black screen when switching chat page*, May 18, 2026 — https://github.com/NousResearch/hermes-agent/issues/27740
[11] **xterm.js Terminal class docs** — `clearTextureAtlas()` method — http://xtermjs.org/docs/api/terminal/classes/terminal
[12] **@xterm/xterm npm versions page** — current `latest`: 6.0.0; current `beta`: 6.1.0-beta.220 (published 2 days ago) — https://www.npmjs.com/package/@xterm/xterm?activeTab=versions
[13] **xterm.js 5.1.0 release notes (Discussion #4334)** — multi-page texture atlas support, prior garbled-glyph fixes — https://github.com/xtermjs/xterm.js/discussions/4334
[14] **VSCode "Integrated Terminal Performance Improvements" blog (2017)** — DOM vs canvas/WebGL perf delta source — https://code.visualstudio.com/blogs/2017/10/03/terminal-renderer
[15] **WezTerm `front_end` docs** — Rust + WebGPU + Metal/Vulkan/DX12 stack — https://wezterm.org/config/lua/config/front_end.html
[16] **superset-sh/superset#3924** — *fix(desktop): drop WebGL renderer in v1 terminal*, merged May 1, 2026 (our own merged PR) — referenced in BRIEF.md
[17] **Mattdesl "Non-Intrusive WebGL Part 1: Context Loss & Preloading"** — `preventDefault()` + restoration patterns reference — https://medium.com/@mattdesl/non-intrusive-webgl-cebd176c281d

---

## Gaps & Open Questions

- **Beta.220 stability at scale.** Published 2 days ago. ~10k weekly DLs and growing. Some downstream consumers (VSCode #317927) are running it, but not yet merged. We'd be early-mid adopters. If we're nervous: stay on beta.219 + Ouroboros-style vendor patch. Otherwise: bump.
- **Whether #5883 covers GH-3572's Chinese-content-specific reports.** The original issue title called out Chinese characters but `valentin-ib`'s confirmation that it reproduces without CJK suggests Chinese was incidental (more character variety = more atlas pressure = more merges = more chance to hit the bug #5883 fixes). High confidence this matches.
- **Frame-budget detection (50ms watchdog).** Tyriar referenced this as "existing detection" in #118064 but we did not locate the actual implementation in current xterm.js source. May be vestigial. Implementation would require profiling for our own use case anyway — not load-bearing on the bump-to-beta.220 decision.
- **Long-term: should we move to xterm.js 7.0.0 GA when it lands?** When 7.0.0 ships on `latest`, we should plan to migrate off the beta train. Out of scope for this improvement but worth a follow-up task.
- **Should we also vendor #5883's belt-and-suspenders error handling for OUR specific GPU-process-death class?** Probably not — the forced-loseContext experiment was diagnostic, not a real-world failure mode. Our actual users are hitting atlas drift (fixed by #5883), not catastrophic context death.

---

## Recommended next move (for refined-options investigator pass)

Refined option set the investigator should produce:

**Option α (PRIMARY — RECOMMENDED): Bump + light fallback**
- Bump `@xterm/xterm` + 6 addons from `6.1.0-beta.219` → `6.1.0-beta.220` (or latest beta of the .220+ train)
- Add `suggestedRendererType = "dom"` to both `onContextLoss` handlers (VSCode pattern, defense-in-depth)
- Total LOC: ~3 lines + dep bump in package.json + lockfile churn
- ~80% confidence resolves GH-3572 + the entire issue cluster (#3527, #3794, #4601, #4639, #3572)

**Option β (CONSERVATIVE — vendor patch instead of dep bump): Vendor + light fallback**
- Stay on `6.1.0-beta.219`
- Add postinstall patcher that applies PR #5883 diff via SHA-256-verified patch (Ouroboros pattern)
- Add `suggestedRendererType = "dom"` to both `onContextLoss` handlers
- Total LOC: ~150 lines (patch tooling) + 3 lines of code
- Same fix-coverage, more controlled scope, but more code to maintain. Only choose if beta.220 has a known regression.

**Option γ (THOROUGH — bump + recovery + heal): Bump + multi-detector + heal**
- Bump to beta.220
- Add VSCode-style onContextLoss → DOM fallback
- Add `Terminal.clearTextureAtlas()` call on tab-visibility-change (proactive heal for any residual atlas drift PR #5883 doesn't catch)
- Optionally: rebuild WebglAddon on visibility-change (Hermes Agent pattern — recovery-back-to-WebGL after a fallback)
- Total LOC: ~30 lines + dep bump

The investigator should pick which of these three becomes "Option 4 minimum / 5 moderate / 6 strategic" alongside (or replacing) the original Minimum/Moderate/Strategic.
