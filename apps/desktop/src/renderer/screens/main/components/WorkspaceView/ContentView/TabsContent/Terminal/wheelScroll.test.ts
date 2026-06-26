import { describe, expect, it } from "bun:test";
import { TERMINAL_OPTIONS } from "./config";

/**
 * Reproduction for issue #5364 — "Choppy scroll: low wheel sensitivity".
 *
 * When a fullscreen/TUI app (e.g. Claude Code) enables mouse-wheel reporting,
 * xterm.js does NOT scroll its own viewport. Instead it converts each browser
 * `wheel` event into a synthetic wheel mouse-report that it forwards to the PTY.
 * That conversion happens in xterm's `MouseService._consumeWheelEvent`:
 *
 *   node_modules/@xterm/xterm/src/browser/services/MouseService.ts
 *
 *     private _consumeWheelEvent(ev, cellHeight, dpr): number {
 *       const targetWheelEventPixels = cellHeight / dpr;
 *       let amount = ev.deltaY * scrollSensitivity;          // _applyScrollModifier
 *       if (ev.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
 *         amount /= targetWheelEventPixels;
 *         const isLikelyTrackpad = Math.abs(ev.deltaY) < 50;
 *         if (isLikelyTrackpad) {
 *           amount *= 0.3;                                    // <-- trackpad dampening
 *         }
 *         this._wheelPartialScroll += amount;
 *         amount = Math.floor(Math.abs(this._wheelPartialScroll)) * (sign);
 *         this._wheelPartialScroll %= 1;
 *       }
 *       return amount;                                        // 0 => event discarded
 *     }
 *
 * If a wheel event resolves to `0` lines it is dropped entirely
 * (`_sendEvent` returns false and nothing is reported to the app). On a Retina
 * trackpad each physical "tick" produces a small pixel delta, so the hardcoded
 * `* 0.3` factor combined with the default `scrollSensitivity` of `1` means many
 * consecutive wheel events accumulate to nothing before a single line finally
 * scrolls — this is the "I have to move the wheel a lot before anything happens"
 * sluggishness reported in the issue.
 *
 * The model below mirrors that algorithm exactly so we can assert the observable
 * behavior without standing up a full DOM + RenderService.
 */

// xterm's `scrollSensitivity` default — see DEFAULT_OPTIONS in
// node_modules/@xterm/xterm/src/common/services/OptionsService.ts
const XTERM_DEFAULT_SCROLL_SENSITIVITY = 1;

// Hardcoded trackpad dampening factor in MouseService._consumeWheelEvent.
const TRACKPAD_DAMPENING = 0.3;

interface WheelModelOptions {
	/** Cell height in *device* pixels (dimensions.device.cell.height). */
	deviceCellHeight: number;
	/** devicePixelRatio (CoreBrowserService.dpr). */
	dpr: number;
	/** xterm `scrollSensitivity` option. */
	scrollSensitivity: number;
}

/**
 * Faithful reimplementation of xterm's pixel-mode (trackpad) wheel quantization.
 * Stateful: `partial` carries the sub-line remainder across events, exactly like
 * the real `_wheelPartialScroll` field.
 */
function makeTrackpadWheelConsumer({
	deviceCellHeight,
	dpr,
	scrollSensitivity,
}: WheelModelOptions): (deltaYPx: number) => number {
	const targetWheelEventPixels = deviceCellHeight / dpr;
	let partial = 0;

	return (deltaYPx: number): number => {
		if (deltaYPx === 0) {
			return 0;
		}
		let amount = deltaYPx * scrollSensitivity;
		amount /= targetWheelEventPixels;

		const isLikelyTrackpad = Math.abs(deltaYPx) < 50;
		if (isLikelyTrackpad) {
			amount *= TRACKPAD_DAMPENING;
		}

		partial += amount;
		const lines = Math.floor(Math.abs(partial)) * (partial > 0 ? 1 : -1);
		partial %= 1;
		return lines;
	};
}

// Representative macOS Retina terminal cell metrics for the default 15px font:
// ~18px CSS line height on a 2x display => 36 device px, dpr 2.
const RETINA = { deviceCellHeight: 36, dpr: 2 } as const;

// A slow trackpad gesture: many small pixel deltas, as macOS emits per tick.
const SLOW_TRACKPAD_DELTA_PX = 4;

describe("issue #5364 — trackpad wheel sensitivity in fullscreen apps", () => {
	it("the app relies on xterm's default scrollSensitivity (no tuning today)", () => {
		// The terminal does not configure scrollSensitivity, so xterm's default of
		// 1 is used — this is the value that, combined with the 0.3 dampening,
		// produces the sluggish feel.
		expect(
			(TERMINAL_OPTIONS as { scrollSensitivity?: number }).scrollSensitivity,
		).toBeUndefined();
	});

	it("REPRO: slow trackpad scrolling discards many events before one line moves", () => {
		const consume = makeTrackpadWheelConsumer({
			...RETINA,
			scrollSensitivity: XTERM_DEFAULT_SCROLL_SENSITIVITY,
		});

		// per-event amount = 4 * 1 / (36/2) * 0.3 = ~0.0667 lines, so it takes
		// ~15 ticks of accumulation before the first line is ever emitted.
		let ticksUntilFirstLine = 0;
		while (consume(SLOW_TRACKPAD_DELTA_PX) === 0) {
			ticksUntilFirstLine++;
			if (ticksUntilFirstLine > 1000) {
				throw new Error("trackpad scroll never registered");
			}
		}

		// The user has to move the trackpad through more than ten discarded
		// ticks before the TUI scrolls a single line — the reported sluggishness.
		expect(ticksUntilFirstLine).toBeGreaterThan(10);
	});

	it("REPRO: a full slow gesture scrolls far less than the wheel was moved", () => {
		const consume = makeTrackpadWheelConsumer({
			...RETINA,
			scrollSensitivity: XTERM_DEFAULT_SCROLL_SENSITIVITY,
		});

		// 60 small ticks of physical trackpad movement.
		let totalLines = 0;
		for (let i = 0; i < 60; i++) {
			totalLines += consume(SLOW_TRACKPAD_DELTA_PX);
		}

		// ~60 * 0.0667 ≈ 4 lines for 60 ticks of movement — i.e. ~15 ticks per
		// line. A snappy terminal (iTerm/Ghostty/Warp) registers a line almost
		// immediately, so this is the measurable sluggishness.
		expect(totalLines).toBeLessThanOrEqual(4);
		expect(totalLines).toBeLessThan(15);
	});

	it("the 0.3 trackpad dampening is the dominant cause of lost sensitivity", () => {
		const damped = makeTrackpadWheelConsumer({
			...RETINA,
			scrollSensitivity: XTERM_DEFAULT_SCROLL_SENSITIVITY,
		});
		// Same gesture, but cancelling the dampening (what other terminals feel
		// like) — modelled here by raising scrollSensitivity to 1/0.3.
		const undamped = makeTrackpadWheelConsumer({
			...RETINA,
			scrollSensitivity: 1 / TRACKPAD_DAMPENING,
		});

		let dampedLines = 0;
		let undampedLines = 0;
		for (let i = 0; i < 60; i++) {
			dampedLines += damped(SLOW_TRACKPAD_DELTA_PX);
			undampedLines += undamped(SLOW_TRACKPAD_DELTA_PX);
		}

		// Undamped scrolling moves ~3.3x more for the identical hand movement,
		// which is the sensitivity gap the issue is asking us to close.
		expect(undampedLines).toBeGreaterThan(dampedLines * 3);
	});
});
