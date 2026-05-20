/**
 * Reproduction tests for issue #4753 — terminal text rendering becomes
 * visually corrupted during long sessions (characters overlap, disappear,
 * or render as garbled symbols).
 *
 * The bug pattern is documented across two prior issues:
 *   - #4010: on macOS, the GPU compositor can drop or corrupt WebGL atlas
 *     pages without firing `onContextLoss`, leaving stale glyphs that paint
 *     as gibberish.
 *   - #4617: xterm measures cell width at `terminal.open()` before custom
 *     fonts finish loading; the cached glyph metrics then diverge from the
 *     actually-rendered font, causing mangled text until the next resize.
 *
 * The v1 terminal cache already runs the recovery pattern — clear the
 * texture atlas any time cell dimensions change so glyphs cached against
 * the previous metrics aren't reused at the new size
 * (`v1-terminal-cache.ts:fitAndRefresh`). v2's `measureAndResize`
 * (`terminal-runtime.ts`) was missing the same clear, so the same atlas
 * corruption persisted there after any resize, contributing to #4753.
 *
 * These tests cover the consolidated `refreshAfterFit` helper used by both
 * paths.
 */

import { describe, expect, mock, test } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { refreshAfterFit } from "./refresh-after-fit";

interface FakeTerminalCalls {
	clearTextureAtlas: number;
	refresh: Array<[number, number]>;
}

function fakeTerminal(rows: number): {
	terminal: XTerm;
	calls: FakeTerminalCalls;
} {
	const calls: FakeTerminalCalls = {
		clearTextureAtlas: 0,
		refresh: [],
	};
	const terminal = {
		rows,
		clearTextureAtlas: () => {
			calls.clearTextureAtlas += 1;
		},
		refresh: (start: number, end: number) => {
			calls.refresh.push([start, end]);
		},
	} as unknown as XTerm;
	return { terminal, calls };
}

describe("refreshAfterFit", () => {
	test("clears the texture atlas when cell dimensions change (regression #4753)", () => {
		const { terminal, calls } = fakeTerminal(30);

		refreshAfterFit(terminal, true);

		expect(calls.clearTextureAtlas).toBe(1);
		expect(calls.refresh).toEqual([[0, 29]]);
	});

	test("does not clear the atlas when dimensions are unchanged", () => {
		const { terminal, calls } = fakeTerminal(24);

		refreshAfterFit(terminal, false);

		expect(calls.clearTextureAtlas).toBe(0);
		expect(calls.refresh).toEqual([[0, 23]]);
	});

	test("forces an atlas clear when options.clearAtlas is true", () => {
		// Reattach path (issue #4010): GPU compositor may have corrupted atlas
		// pages while the wrapper was parked, even though dimensions match.
		const { terminal, calls } = fakeTerminal(24);

		refreshAfterFit(terminal, false, { clearAtlas: true });

		expect(calls.clearTextureAtlas).toBe(1);
		expect(calls.refresh).toEqual([[0, 23]]);
	});

	test("clamps the refresh range to a non-negative end row", () => {
		// `terminal.rows - 1` underflows to -1 if rows is 0, which would push
		// xterm into an invalid range — guard with Math.max(0, …).
		const { terminal, calls } = fakeTerminal(0);

		refreshAfterFit(terminal, true);

		expect(calls.refresh).toEqual([[0, 0]]);
	});

	test("swallows errors thrown by clearTextureAtlas", () => {
		// Older xterm builds without WebGL can throw instead of no-op'ing;
		// the helper must still refresh so callers don't lose redraws.
		const refresh = mock();
		const terminal = {
			rows: 24,
			clearTextureAtlas: () => {
				throw new Error("WebGL not active");
			},
			refresh,
		} as unknown as XTerm;

		expect(() => refreshAfterFit(terminal, true)).not.toThrow();
		expect(refresh).toHaveBeenCalledWith(0, 23);
	});
});
