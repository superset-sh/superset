# GH-3572: Deferred Follow-ups

These items were identified during scope investigation but are explicitly out of scope for all three options. They are recorded here for future tracking.

## 1. Upstream xterm.js fix (xtermjs/xterm.js#5883)

The upstream xterm.js PR #5883 is a proposed fix for the texture-atlas corruption tracked in #5816. If it lands and is released, we should evaluate upgrading `@xterm/addon-webgl` and re-enabling WebGL on macOS (minimum/moderate options) or universally (strategic option). Track the PR status before committing to strategic option permanently.

## 2. Investigate Kitenite's cluster of related terminal issues

BRIEF.md lists related issues: #3208, #3321, #2968, #1065, #3406, #3570, #3794, #3527, #3504, #3668. Some of these may share the same root cause (WebGL corruption manifesting differently). A focused investigation pass across these issues could reveal whether the fix here resolves them as a group.

## 3. Real WebGL atlas regression test harness

The github-actions bot explicitly noted: "root cause only manifests in a real browser + GPU + many open tabs… can't be exercised from `bun:test`." A Playwright-based test harness with GPU passthrough (or a macOS CI runner with a GPU) could catch future regressions. This is non-trivial to set up but would provide lasting protection.

## 4. DOM vs WebGL performance benchmark with our actual workloads

The tradeoff (DOM slower under high-throughput streaming) is currently documented qualitatively. A quantitative benchmark against our actual agentic-coding workloads (typical Claude Code output rates) would provide evidence-based justification for whichever option is chosen and document the real-world delta for future decision-makers.

## 5. Remove `max-active-webgl-contexts: 256` override after strategic option

If strategic option is chosen (WebGL dropped entirely), the `app.commandLine.appendSwitch("max-active-webgl-contexts", "256")` at `apps/desktop/src/lib/electron-app/factories/app/setup.ts:90` becomes dead code. Remove it in a separate cleanup PR after the strategic option is confirmed stable.

## 6. Unify the two isolated `suggestedRendererType` variables

`terminal-addons.ts:17` and `helpers.ts:61` each declare their own `let suggestedRendererType` — they are NOT shared. A failure detected in one path does not protect the other. If minimum or moderate option is chosen, consider extracting this variable into a shared module (e.g. `renderer/lib/terminal/webgl-policy.ts`) so that a context loss in either path immediately prevents re-attempts in both. This is out of scope for minimum to keep the change as small as possible, but is a real latent bug on Windows/Linux.

## 7. Per-user opt-in WebGL toggle (settings → experimental)

If strategic option is chosen, a power-user escape hatch ("Enable WebGL terminal renderer (experimental)") in Settings → Experimental could allow users who need maximum rendering throughput on non-macOS platforms to opt back in. This follows the existing experimental settings pattern visible in `renderer/routes/_authenticated/settings/experimental/`. Deferred to avoid complexity in the current fix.
