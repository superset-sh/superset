import { describe, expect, it, mock } from "bun:test";
import {
	installVisibilityRefresh,
	type RefreshableTerminal,
	type VisibilityDocument,
} from "./terminal-visibility-refresh";

/**
 * A controllable stand-in for `document` that actually stores and dispatches
 * `visibilitychange` listeners, so a test can simulate a screen lock/unlock.
 */
function makeFakeDocument(initial: DocumentVisibilityState = "visible") {
	const listeners = new Set<() => void>();
	const doc = {
		visibilityState: initial,
		addEventListener: mock(
			(_type: "visibilitychange", listener: () => void) => {
				listeners.add(listener);
			},
		),
		removeEventListener: mock(
			(_type: "visibilitychange", listener: () => void) => {
				listeners.delete(listener);
			},
		),
	};
	return {
		doc: doc as unknown as VisibilityDocument,
		/** Simulate the OS hiding the page (screen lock / display sleep). */
		hide() {
			doc.visibilityState = "hidden";
			for (const l of listeners) l();
		},
		/** Simulate the page returning to the foreground (screen unlock). */
		reveal() {
			doc.visibilityState = "visible";
			for (const l of listeners) l();
		},
		listenerCount: () => listeners.size,
	};
}

function makeFakeTerminal(rows = 24) {
	const refresh = mock((_start: number, _end: number) => {});
	const clearTextureAtlas = mock(() => {});
	const terminal = { rows, refresh, clearTextureAtlas };
	return {
		terminal: terminal as unknown as RefreshableTerminal,
		refresh,
		clearTextureAtlas,
	};
}

describe("installVisibilityRefresh — issue #5261 (garbled terminal after screen unlock)", () => {
	it("repaints the terminal when the page returns to the foreground", () => {
		// Reproduces #5261: after a screen lock the GPU silently drops the WebGL
		// backing store. xterm's onContextLoss fallback never fires, so on unlock
		// the terminal keeps drawing from a stale texture atlas and the cells look
		// garbled. The recovery is to rebuild the atlas and force a full repaint.
		const { terminal, refresh, clearTextureAtlas } = makeFakeTerminal(24);
		const { doc, hide, reveal } = makeFakeDocument();

		installVisibilityRefresh(terminal, doc);

		// Screen locks — nothing should repaint while hidden.
		hide();
		expect(refresh).not.toHaveBeenCalled();
		expect(clearTextureAtlas).not.toHaveBeenCalled();

		// Screen unlocks — the terminal must rebuild glyphs and redraw every row.
		reveal();
		expect(clearTextureAtlas).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenLastCalledWith(0, 23);
	});

	it("does nothing while the page is hidden", () => {
		const { terminal, refresh, clearTextureAtlas } = makeFakeTerminal();
		const { doc, hide } = makeFakeDocument();

		installVisibilityRefresh(terminal, doc);
		hide();

		expect(refresh).not.toHaveBeenCalled();
		expect(clearTextureAtlas).not.toHaveBeenCalled();
	});

	it("tolerates terminals without clearTextureAtlas (DOM renderer)", () => {
		const refresh = mock((_start: number, _end: number) => {});
		const terminal = { rows: 10, refresh } as unknown as RefreshableTerminal;
		const { doc, reveal } = makeFakeDocument();

		installVisibilityRefresh(terminal, doc);
		expect(() => reveal()).not.toThrow();
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenLastCalledWith(0, 9);
	});

	it("clamps the refresh range for a zero-row terminal", () => {
		const { terminal, refresh } = makeFakeTerminal(0);
		const { doc, reveal } = makeFakeDocument();

		installVisibilityRefresh(terminal, doc);
		reveal();

		expect(refresh).toHaveBeenLastCalledWith(0, 0);
	});

	it("removes the listener when disposed", () => {
		const { terminal, refresh } = makeFakeTerminal();
		const fake = makeFakeDocument();

		const dispose = installVisibilityRefresh(terminal, fake.doc);
		expect(fake.listenerCount()).toBe(1);

		dispose();
		expect(fake.listenerCount()).toBe(0);

		fake.reveal();
		expect(refresh).not.toHaveBeenCalled();
	});
});
