import { beforeAll, describe, expect, it } from "bun:test";

let setupKeyboardHandler!: typeof import("./helpers").setupKeyboardHandler;

beforeAll(async () => {
	Object.defineProperty(globalThis, "window", {
		value: {
			addEventListener() {},
			removeEventListener() {},
		},
		configurable: true,
	});
	Object.defineProperty(globalThis, "electronTRPC", {
		value: {
			sendMessage() {},
			onMessage() {},
		},
		configurable: true,
	});
	setupKeyboardHandler = (await import("./helpers")).setupKeyboardHandler;
});

function installKeyboardHandler(): (event: KeyboardEvent) => boolean {
	let currentHandler: ((event: KeyboardEvent) => boolean) | null = null;
	setupKeyboardHandler({
		attachCustomKeyEventHandler: (
			handler: (event: KeyboardEvent) => boolean,
		) => {
			currentHandler = handler;
		},
	} as never);
	if (!currentHandler) {
		throw new Error("Keyboard handler was not attached");
	}
	return currentHandler;
}

function makeKeyEvent(
	input: Partial<KeyboardEventInit> & { key: string; code?: string },
): KeyboardEvent {
	return {
		type: "keydown",
		key: input.key,
		code: input.code ?? `Key${input.key.toUpperCase()}`,
		ctrlKey: input.ctrlKey ?? false,
		metaKey: input.metaKey ?? false,
		altKey: input.altKey ?? false,
		shiftKey: input.shiftKey ?? false,
		preventDefault() {},
		stopPropagation() {},
	} as KeyboardEvent;
}

describe("setupKeyboardHandler", () => {
	it("keeps unbound Ctrl chords inside the terminal", () => {
		const handler = installKeyboardHandler();

		expect(handler(makeKeyEvent({ key: "b", ctrlKey: true }))).toBe(true);
		expect(handler(makeKeyEvent({ key: "o", ctrlKey: true }))).toBe(true);
		expect(handler(makeKeyEvent({ key: "a", ctrlKey: true }))).toBe(true);
		expect(handler(makeKeyEvent({ key: "e", ctrlKey: true }))).toBe(true);
	});

	it("still lets registered app hotkeys bubble out of the terminal", () => {
		const handler = installKeyboardHandler();

		expect(
			handler(
				makeKeyEvent({
					key: "o",
					code: "KeyO",
					metaKey: true,
				}),
			),
		).toBe(false);
	});
});
