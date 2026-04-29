import { describe, expect, it, mock } from "bun:test";
import { createTerminalKeyboardHandler } from "./terminalKeyboardHandler";

// In Bun's test runtime `navigator` is undefined, so registry.ts falls back to
// "mac" (see registry.ts:16). Platform-specific bindings in these tests are
// therefore mac bindings: ZOOM_PANE = meta+shift+enter.

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		key: "Enter",
		code: "Enter",
		type: "keydown",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		keyCode: 0,
		preventDefault: () => {},
		getModifierState: () => false,
		...overrides,
	} as unknown as KeyboardEvent;
}

function makeXterm() {
	return {
		selectAll: mock(() => {}),
		hasSelection: mock(() => false),
	};
}

describe("terminalKeyboardHandler", () => {
	describe("ZOOM_PANE chord (meta+shift+enter, mac binding)", () => {
		it("returns false so the app-level hotkey bubbles to the document", () => {
			const handler = createTerminalKeyboardHandler(makeXterm());
			const event = makeKeyEvent({
				key: "Enter",
				code: "Enter",
				metaKey: true,
				shiftKey: true,
			});
			expect(handler(event)).toBe(false);
		});

		it("does NOT call onShiftEnter — meta+shift+enter is ZOOM_PANE, not line-continuation", () => {
			const onShiftEnter = mock(() => {});
			const handler = createTerminalKeyboardHandler(makeXterm(), {
				onShiftEnter,
			});
			const event = makeKeyEvent({
				key: "Enter",
				code: "Enter",
				metaKey: true,
				shiftKey: true,
			});
			handler(event);
			expect(onShiftEnter).not.toHaveBeenCalled();
		});
	});

	describe("plain Shift+Enter (line-continuation, no modifier)", () => {
		it("calls onShiftEnter on keydown and returns false", () => {
			const onShiftEnter = mock(() => {});
			const handler = createTerminalKeyboardHandler(makeXterm(), {
				onShiftEnter,
			});
			const event = makeKeyEvent({
				key: "Enter",
				code: "Enter",
				type: "keydown",
				shiftKey: true,
			});
			expect(handler(event)).toBe(false);
			expect(onShiftEnter).toHaveBeenCalledTimes(1);
		});

		it("does NOT call onShiftEnter on keyup — only keydown triggers it", () => {
			const onShiftEnter = mock(() => {});
			const handler = createTerminalKeyboardHandler(makeXterm(), {
				onShiftEnter,
			});
			const event = makeKeyEvent({
				key: "Enter",
				code: "Enter",
				type: "keyup",
				shiftKey: true,
			});
			handler(event);
			expect(onShiftEnter).not.toHaveBeenCalled();
		});
	});

	describe("Ctrl+Shift+Enter (windows/linux ZOOM_PANE chord)", () => {
		it("does not call onShiftEnter — ctrlKey guard in isShiftEnter blocks line-continuation", () => {
			// In the test runtime navigator is undefined → PLATFORM defaults to "mac".
			// On mac, ctrl+shift+enter is NOT a registered app hotkey (mac ZOOM_PANE
			// is meta+shift+enter), so resolveHotkeyFromEvent returns null. The
			// isShiftEnter guard then rejects it because ctrlKey is true — it falls
			// through to xterm (returns true). The key regression assertion is that
			// onShiftEnter is NOT called regardless of what xterm does with the key.
			const onShiftEnter = mock(() => {});
			const handler = createTerminalKeyboardHandler(makeXterm(), {
				onShiftEnter,
			});
			const event = makeKeyEvent({
				key: "Enter",
				code: "Enter",
				ctrlKey: true,
				shiftKey: true,
			});
			handler(event);
			expect(onShiftEnter).not.toHaveBeenCalled();
		});
	});
});
