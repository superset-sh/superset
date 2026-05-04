import { describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { setupClickToMoveCursor } from "./terminal-click-to-move";

const CELL_W = 10;
const CELL_H = 20;

function makeFakeTerminal(
	opts: {
		cursorX?: number;
		hasSelection?: boolean;
		useAlternate?: boolean;
		mouseTrackingMode?: string;
	} = {},
) {
	const {
		cursorX = 5,
		hasSelection = false,
		useAlternate = false,
		mouseTrackingMode = "none",
	} = opts;
	const normal = { cursorX, cursorY: 0, viewportY: 0 };
	const listeners = new Map<string, Set<(e: MouseEvent) => void>>();
	const element = {
		getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
		addEventListener: (type: string, h: (e: MouseEvent) => void) => {
			let s = listeners.get(type);
			if (!s) {
				s = new Set();
				listeners.set(type, s);
			}
			s.add(h);
		},
		removeEventListener: (type: string, h: (e: MouseEvent) => void) =>
			listeners.get(type)?.delete(h),
		dispatchEvent: (e: MouseEvent) => {
			for (const h of listeners.get(e.type) ?? []) h(e);
			return true;
		},
	} as unknown as HTMLElement;

	const xterm = {
		cols: 80,
		rows: 24,
		element,
		buffer: { active: useAlternate ? { ...normal } : normal, normal },
		hasSelection: () => hasSelection,
		modes: { mouseTrackingMode },
		_core: {
			_renderService: {
				dimensions: { css: { cell: { width: CELL_W, height: CELL_H } } },
			},
		},
	} as unknown as XTerm;
	return { xterm, element };
}

function clickAt(col: number, row = 0, overrides: Partial<MouseEvent> = {}) {
	return {
		type: "click",
		button: 0,
		clientX: col * CELL_W + CELL_W / 2,
		clientY: row * CELL_H + CELL_H / 2,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	} as MouseEvent;
}

describe("setupClickToMoveCursor", () => {
	it("emits the right number of right/left arrow sequences for the click delta", () => {
		// Right of cursor: cursorX=5, click col=10 → 5x \x1b[C
		const right = makeFakeTerminal({ cursorX: 5 });
		const onWriteRight = mock();
		setupClickToMoveCursor(right.xterm, { onWrite: onWriteRight });
		right.element.dispatchEvent(clickAt(10));
		expect(onWriteRight.mock.calls[0]?.[0]).toBe("\x1b[C".repeat(5));

		// Left of cursor: cursorX=10, click col=7 → 3x \x1b[D
		const left = makeFakeTerminal({ cursorX: 10 });
		const onWriteLeft = mock();
		setupClickToMoveCursor(left.xterm, { onWrite: onWriteLeft });
		left.element.dispatchEvent(clickAt(7));
		expect(onWriteLeft.mock.calls[0]?.[0]).toBe("\x1b[D".repeat(3));

		// Same column: no-op
		const same = makeFakeTerminal({ cursorX: 5 });
		const onWriteSame = mock();
		setupClickToMoveCursor(same.xterm, { onWrite: onWriteSame });
		same.element.dispatchEvent(clickAt(5));
		expect(onWriteSame).not.toHaveBeenCalled();
	});

	it.each([
		["different row", { row: 1 }],
		["non-left button", { button: 1 }],
		["right button", { button: 2 }],
		["meta modifier", { metaKey: true }],
		["ctrl modifier", { ctrlKey: true }],
		["alt modifier", { altKey: true }],
		["shift modifier", { shiftKey: true }],
	])("ignores clicks with %s", (_label, overrides) => {
		const { xterm, element } = makeFakeTerminal({ cursorX: 5 });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });
		const { row = 0, ...mouseOverrides } = overrides as {
			row?: number;
		} & Partial<MouseEvent>;
		element.dispatchEvent(clickAt(10, row, mouseOverrides));
		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores clicks with an active selection, alternate buffer, or mouse tracking", () => {
		for (const opts of [
			{ hasSelection: true },
			{ useAlternate: true },
			{ mouseTrackingMode: "x10" },
		]) {
			const { xterm, element } = makeFakeTerminal({ cursorX: 5, ...opts });
			const onWrite = mock();
			setupClickToMoveCursor(xterm, { onWrite });
			element.dispatchEvent(clickAt(10));
			expect(onWrite).not.toHaveBeenCalled();
		}
	});

	it("returns a cleanup function that removes the click listener", () => {
		const { xterm, element } = makeFakeTerminal({ cursorX: 5 });
		const onWrite = mock();
		const cleanup = setupClickToMoveCursor(xterm, { onWrite });
		cleanup();
		element.dispatchEvent(clickAt(10));
		expect(onWrite).not.toHaveBeenCalled();
	});
});
