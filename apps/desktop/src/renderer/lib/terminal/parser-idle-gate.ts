/**
 * Parser-safe resize coordination for xterm.
 *
 * `terminal.resize()` (reached via `FitAddon.fit()`) calls
 * `WriteBuffer.flushSync()` internally, which re-enters the escape-sequence
 * parser *synchronously*. If an async parser handler is mid-flight, that
 * re-entry throws
 *
 *   "improper continuation due to previous async handler, giving up parsing"
 *
 * and leaves the parser permanently FAILed — every later write throws too, so
 * the terminal is bricked. The image addon hits this: inline images (iTerm
 * OSC 1337 / Kitty) decode via `createImageBitmap(...).then(...)`, an async
 * handler that keeps the parser paused while the bitmap decodes. A resize
 * landing in that window (window/sidebar resize, font change, attach) trips it.
 *
 * So we never resize while a write is still being parsed. `wrapWrite` decorates
 * the terminal's own `write` once, counting in-flight writes — xterm fires a
 * write's callback only after that chunk (and its async handlers) has fully
 * parsed, so `pending === 0` means the parser is back in GROUND. Wrapping the
 * instance method means every write is counted; nothing can bypass it.
 * `runWhenParserIdle` then runs the resize immediately when nothing is pending,
 * or parks it until the count drops back to zero (flushed from the settling
 * write's callback, on a microtask so the eventual `flushSync` never runs
 * re-entrantly inside xterm's own write loop).
 *
 * This module is intentionally free of xterm imports so it stays trivially
 * unit-testable; the caller supplies the raw `write` to decorate.
 */

type WriteFn = (data: string | Uint8Array, callback?: () => void) => void;

export interface ParserIdleGate {
	pending: number;
	/** Latest resize parked while writes were in flight; newer ones supersede. */
	queued: (() => void) | null;
}

export function createParserIdleGate(): ParserIdleGate {
	return { pending: 0, queued: null };
}

export function cancelParserIdleWork(gate: ParserIdleGate): void {
	gate.queued = null;
}

function flushQueued(gate: ParserIdleGate): void {
	// A write may have snuck in after the count last hit zero; its own callback
	// will re-trigger this once it settles, so just wait.
	if (gate.pending !== 0) return;
	const fn = gate.queued;
	if (!fn) return;
	gate.queued = null;
	fn();
}

/**
 * Decorate a terminal's `write` so every call feeds the gate. Returns the
 * wrapped function to assign back onto the terminal instance.
 */
export function wrapWrite(gate: ParserIdleGate, write: WriteFn): WriteFn {
	return (data, callback) => {
		gate.pending++;
		write(data, () => {
			gate.pending--;
			// Defer to a microtask so a parked resize never runs re-entrantly from
			// inside xterm's `_innerWrite` loop (a nested `flushSync` corrupts the
			// write buffer).
			if (gate.pending === 0 && gate.queued) {
				queueMicrotask(() => flushQueued(gate));
			}
			callback?.();
		});
	};
}

/**
 * Run `fn` (which may call `terminal.resize()`/`fit()`) only when the parser is
 * idle. Runs synchronously if no writes are in flight; otherwise parks it until
 * they drain. Only the most recent parked `fn` runs — intermediate resizes are
 * superseded, which is what we want for a fit-to-container.
 */
export function runWhenParserIdle(gate: ParserIdleGate, fn: () => void): void {
	if (gate.pending === 0) {
		fn();
		return;
	}
	gate.queued = fn;
}
