import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useHotkeyOverridesStore } from "renderer/hotkeys";
import { setupKeyboardHandler } from "./terminalKeyboardHandler";

type CapturedHandler = (event: KeyboardEvent) => boolean;

function setPlatform(platform: string) {
	Object.defineProperty(globalThis, "navigator", {
		value: { platform },
		configurable: true,
	});
}

function makeXterm(options: { hasSelection?: boolean } = {}) {
	let handler: CapturedHandler | null = null;
	let selectAllCount = 0;

	const xterm = {
		attachCustomKeyEventHandler: (next: CapturedHandler) => {
			handler = next;
		},
		hasSelection: () => options.hasSelection ?? false,
		selectAll: () => {
			selectAllCount += 1;
		},
	} as unknown as XTerm;

	return {
		xterm,
		get selectAllCount() {
			return selectAllCount;
		},
		invoke(event: KeyboardEvent) {
			if (!handler) throw new Error("Keyboard handler was not attached");
			return handler(event);
		},
	};
}

function makeKeyEvent(
	init: Partial<KeyboardEvent> & Pick<KeyboardEvent, "code" | "key">,
) {
	let defaultPrevented = false;
	const event = {
		type: "keydown",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...init,
		preventDefault: () => {
			defaultPrevented = true;
		},
	} as KeyboardEvent;

	return {
		event,
		get defaultPrevented() {
			return defaultPrevented;
		},
	};
}

describe("setupKeyboardHandler", () => {
	let originalOverrides: Record<string, string | null>;

	beforeEach(() => {
		setPlatform("MacIntel");
		originalOverrides = useHotkeyOverridesStore.getState().overrides;
		useHotkeyOverridesStore.setState({ overrides: {} });
	});

	afterEach(() => {
		useHotkeyOverridesStore.setState({ overrides: originalOverrides });
	});

	it("bubbles registered app hotkeys before macOS Cmd bubbling", () => {
		const writes: string[] = [];
		const terminal = makeXterm();
		setupKeyboardHandler(terminal.xterm, {
			onWrite: (data) => writes.push(data),
		});

		const key = makeKeyEvent({
			code: "KeyK",
			key: "k",
			metaKey: true,
		});

		expect(terminal.invoke(key.event)).toBe(false);
		expect(key.defaultPrevented).toBe(false);
		expect(writes).toEqual([]);
	});

	it("lets customized app hotkeys win over line-edit translations", () => {
		useHotkeyOverridesStore.setState({
			overrides: { NEW_GROUP: "meta+arrowleft" },
		});

		const writes: string[] = [];
		const terminal = makeXterm();
		setupKeyboardHandler(terminal.xterm, {
			onWrite: (data) => writes.push(data),
		});

		const key = makeKeyEvent({
			code: "ArrowLeft",
			key: "ArrowLeft",
			metaKey: true,
		});

		expect(terminal.invoke(key.event)).toBe(false);
		expect(key.defaultPrevented).toBe(false);
		expect(writes).toEqual([]);
	});

	it("keeps v1 line-edit translations when no app hotkey is bound", () => {
		const writes: string[] = [];
		const terminal = makeXterm();
		setupKeyboardHandler(terminal.xterm, {
			onWrite: (data) => writes.push(data),
		});

		const key = makeKeyEvent({
			code: "ArrowLeft",
			key: "ArrowLeft",
			metaKey: true,
		});

		expect(terminal.invoke(key.event)).toBe(false);
		expect(key.defaultPrevented).toBe(true);
		expect(writes).toEqual(["\x01"]);
	});

	it("keeps Cmd+A as terminal select-all when it is not an app hotkey", () => {
		const terminal = makeXterm();
		setupKeyboardHandler(terminal.xterm);

		const key = makeKeyEvent({
			code: "KeyA",
			key: "a",
			metaKey: true,
		});

		expect(terminal.invoke(key.event)).toBe(false);
		expect(key.defaultPrevented).toBe(true);
		expect(terminal.selectAllCount).toBe(1);
	});
});
