import { describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { setupClickToMoveCursor } from "./terminal-click-to-move";

interface FakeTerminalOptions {
	cols?: number;
	rows?: number;
	cursorX?: number;
	cursorY?: number;
	viewportY?: number;
	hasSelection?: boolean;
	useAlternate?: boolean;
	cellWidth?: number;
	cellHeight?: number;
	mouseTrackingMode?: string;
	withElement?: boolean;
}

interface FakeTerminal {
	xterm: XTerm;
	element: HTMLElement | null;
}

function makeFakeTerminal(opts: FakeTerminalOptions = {}): FakeTerminal {
	const {
		cols = 80,
		rows = 24,
		cursorX = 5,
		cursorY = 0,
		viewportY = 0,
		hasSelection = false,
		useAlternate = false,
		cellWidth = 10,
		cellHeight = 20,
		mouseTrackingMode = "none",
		withElement = true,
	} = opts;

	const buffer = {
		cursorX,
		cursorY,
		viewportY,
	};

	const normalBuffer = buffer;
	const altBuffer = { ...buffer };

	const listeners = new Map<string, Set<(event: MouseEvent) => void>>();
	const element: HTMLElement | null = withElement
		? ({
				getBoundingClientRect() {
					return {
						left: 0,
						top: 0,
						right: cols * cellWidth,
						bottom: rows * cellHeight,
						width: cols * cellWidth,
						height: rows * cellHeight,
						x: 0,
						y: 0,
						toJSON() {
							return {};
						},
					};
				},
				addEventListener(type: string, handler: (event: MouseEvent) => void) {
					let set = listeners.get(type);
					if (!set) {
						set = new Set();
						listeners.set(type, set);
					}
					set.add(handler);
				},
				removeEventListener(
					type: string,
					handler: (event: MouseEvent) => void,
				) {
					listeners.get(type)?.delete(handler);
				},
				dispatchEvent(event: MouseEvent) {
					for (const handler of listeners.get(event.type) ?? []) {
						handler(event);
					}
					return true;
				},
			} as unknown as HTMLElement)
		: null;

	const xterm = {
		cols,
		rows,
		element,
		buffer: {
			active: useAlternate ? altBuffer : normalBuffer,
			normal: normalBuffer,
		},
		hasSelection: () => hasSelection,
		modes: { mouseTrackingMode },
		_core: {
			_renderService: {
				dimensions: {
					css: { cell: { width: cellWidth, height: cellHeight } },
				},
			},
		},
	} as unknown as XTerm;

	return { xterm, element };
}

function makeMouseEvent(
	overrides: Partial<{
		button: number;
		clientX: number;
		clientY: number;
		metaKey: boolean;
		ctrlKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
		type: string;
	}> = {},
): MouseEvent {
	return {
		type: overrides.type ?? "click",
		button: overrides.button ?? 0,
		clientX: overrides.clientX ?? 0,
		clientY: overrides.clientY ?? 0,
		metaKey: overrides.metaKey ?? false,
		ctrlKey: overrides.ctrlKey ?? false,
		altKey: overrides.altKey ?? false,
		shiftKey: overrides.shiftKey ?? false,
	} as MouseEvent;
}

describe("setupClickToMoveCursor", () => {
	it("emits right-arrow sequences when clicking right of the cursor", () => {
		// cursorX=5, click at col 10 → delta=5, expect 5x \x1b[C
		const { xterm, element } = makeFakeTerminal({ cursorX: 5, cursorY: 0 });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		// Cell width 10, so x=105 → col 10. Cell height 20, y=10 → row 0.
		element?.dispatchEvent(makeMouseEvent({ clientX: 105, clientY: 10 }));

		expect(onWrite).toHaveBeenCalledTimes(1);
		expect(onWrite.mock.calls[0]?.[0]).toBe("\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C");
	});

	it("emits left-arrow sequences when clicking left of the cursor", () => {
		// cursorX=10, click at col 7 → delta=-3, expect 3x \x1b[D
		const { xterm, element } = makeFakeTerminal({ cursorX: 10, cursorY: 0 });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		element?.dispatchEvent(makeMouseEvent({ clientX: 75, clientY: 10 }));

		expect(onWrite).toHaveBeenCalledTimes(1);
		expect(onWrite.mock.calls[0]?.[0]).toBe("\x1b[D\x1b[D\x1b[D");
	});

	it("does nothing when clicking exactly on the cursor", () => {
		const { xterm, element } = makeFakeTerminal({ cursorX: 5, cursorY: 0 });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		// x=55 → col 5 (same as cursorX)
		element?.dispatchEvent(makeMouseEvent({ clientX: 55, clientY: 10 }));

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores clicks on a different row than the cursor", () => {
		const { xterm, element } = makeFakeTerminal({ cursorX: 5, cursorY: 0 });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		// y=30 → row 1, cursor is on row 0
		element?.dispatchEvent(makeMouseEvent({ clientX: 105, clientY: 30 }));

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores non-left mouse buttons", () => {
		const { xterm, element } = makeFakeTerminal();
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		element?.dispatchEvent(
			makeMouseEvent({ button: 1, clientX: 105, clientY: 10 }),
		);
		element?.dispatchEvent(
			makeMouseEvent({ button: 2, clientX: 105, clientY: 10 }),
		);

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores clicks with modifier keys", () => {
		const { xterm, element } = makeFakeTerminal();
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		for (const mod of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const) {
			element?.dispatchEvent(
				makeMouseEvent({ [mod]: true, clientX: 105, clientY: 10 }),
			);
		}

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores clicks while the user has an active selection", () => {
		const { xterm, element } = makeFakeTerminal({ hasSelection: true });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		element?.dispatchEvent(makeMouseEvent({ clientX: 105, clientY: 10 }));

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores clicks while in the alternate buffer (vim, less, etc.)", () => {
		const { xterm, element } = makeFakeTerminal({ useAlternate: true });
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		element?.dispatchEvent(makeMouseEvent({ clientX: 105, clientY: 10 }));

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("ignores clicks while DEC mouse-tracking is active", () => {
		const { xterm, element } = makeFakeTerminal({
			mouseTrackingMode: "x10",
		});
		const onWrite = mock();
		setupClickToMoveCursor(xterm, { onWrite });

		element?.dispatchEvent(makeMouseEvent({ clientX: 105, clientY: 10 }));

		expect(onWrite).not.toHaveBeenCalled();
	});

	it("returns a cleanup function that removes the click listener", () => {
		const { xterm, element } = makeFakeTerminal();
		const onWrite = mock();
		const cleanup = setupClickToMoveCursor(xterm, { onWrite });

		cleanup();
		element?.dispatchEvent(makeMouseEvent({ clientX: 105, clientY: 10 }));

		expect(onWrite).not.toHaveBeenCalled();
	});
});
