import { describe, expect, it } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { createTerminalWheelEventHandler } from "./terminal-wheel-event-handler";

function fakeTerminal(bufferType: "normal" | "alternate", cellHeight = 16) {
	const inputs: string[] = [];
	const terminal = {
		buffer: { active: { type: bufferType } },
		input: (data: string) => {
			inputs.push(data);
		},
		_core: {
			_renderService: { dimensions: { css: { cell: { height: cellHeight } } } },
		},
	} as unknown as XTerm;
	return { terminal, inputs };
}

function wheel(overrides: Partial<WheelEvent>): WheelEvent {
	return { deltaY: 0, deltaMode: 0, ...overrides } as WheelEvent;
}

describe("createTerminalWheelEventHandler", () => {
	it("lets xterm handle the wheel on the normal buffer", () => {
		const { terminal, inputs } = fakeTerminal("normal");
		const handler = createTerminalWheelEventHandler(terminal);

		expect(handler(wheel({ deltaY: -120 }))).toBe(true);
		expect(inputs).toEqual([]);
	});

	it("sends PageUp and swallows the event when scrolling up on alt screen", () => {
		const { terminal, inputs } = fakeTerminal("alternate");
		const handler = createTerminalWheelEventHandler(terminal);

		expect(handler(wheel({ deltaY: -16 }))).toBe(false);
		expect(inputs).toEqual(["\x1b[5~"]);
	});

	it("sends PageDown when scrolling down on alt screen", () => {
		const { terminal, inputs } = fakeTerminal("alternate");
		const handler = createTerminalWheelEventHandler(terminal);

		expect(handler(wheel({ deltaY: 16 }))).toBe(false);
		expect(inputs).toEqual(["\x1b[6~"]);
	});

	it("scales pixel deltas by cell height", () => {
		const { terminal, inputs } = fakeTerminal("alternate", 16);
		const handler = createTerminalWheelEventHandler(terminal);

		handler(wheel({ deltaY: 48 }));
		expect(inputs).toEqual(["\x1b[6~", "\x1b[6~", "\x1b[6~"]);
	});

	it("treats line-mode deltas as line counts", () => {
		const { terminal, inputs } = fakeTerminal("alternate");
		const handler = createTerminalWheelEventHandler(terminal);

		handler(wheel({ deltaY: -3, deltaMode: 1 }));
		expect(inputs).toEqual(["\x1b[5~", "\x1b[5~", "\x1b[5~"]);
	});

	it("caps the number of sequences per event", () => {
		const { terminal, inputs } = fakeTerminal("alternate");
		const handler = createTerminalWheelEventHandler(terminal);

		handler(wheel({ deltaY: 1000 }));
		expect(inputs).toHaveLength(6);
	});

	it("swallows a zero-delta wheel event without emitting input", () => {
		const { terminal, inputs } = fakeTerminal("alternate");
		const handler = createTerminalWheelEventHandler(terminal);

		expect(handler(wheel({ deltaY: 0 }))).toBe(false);
		expect(inputs).toEqual([]);
	});
});
