import { describe, expect, it } from "bun:test";
import { captureHotkeyFromEvent } from "./useRecordHotkeys";

/**
 * Covers the three regressions fixed in
 * apps/desktop/plans/20260412-keyboard-recorder-ctrl-binding-fix.md
 *
 * Note: `captureHotkeyFromEvent` reads `PLATFORM` via registry.ts, which in a
 * Bun test runtime without a DOM navigator resolves to "mac". The meta-on-
 * non-Mac branch is exercised indirectly via review, not here.
 */

// Bun test runtime has no DOM KeyboardEvent; stub just what the code reads.
interface StubInit {
	code?: string | undefined;
	key?: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}
function ev(init: StubInit): KeyboardEvent {
	return {
		type: "keydown",
		// Preserve explicit `undefined` so the captureHotkeyFromEvent guard
		// against synthetic events (no event.code) is actually exercised.
		...("code" in init ? { code: init.code } : { code: "" }),
		key: init.key ?? "",
		ctrlKey: !!init.ctrlKey,
		metaKey: !!init.metaKey,
		altKey: !!init.altKey,
		shiftKey: !!init.shiftKey,
		preventDefault() {},
		stopPropagation() {},
	} as unknown as KeyboardEvent;
}

describe("captureHotkeyFromEvent — Bug 1: lone Ctrl must not auto-commit", () => {
	it("returns null when only Control is pressed", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "ControlLeft", ctrlKey: true })),
		).toBeNull();
		expect(
			captureHotkeyFromEvent(ev({ code: "ControlRight", ctrlKey: true })),
		).toBeNull();
	});

	it("returns null for every other lone modifier", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "ShiftLeft", shiftKey: true })),
		).toBeNull();
		expect(
			captureHotkeyFromEvent(ev({ code: "AltLeft", altKey: true })),
		).toBeNull();
		expect(
			captureHotkeyFromEvent(ev({ code: "MetaLeft", metaKey: true })),
		).toBeNull();
	});

	it("ignores lock keys even if Ctrl is also held", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "CapsLock", ctrlKey: true })),
		).toBeNull();
		expect(
			captureHotkeyFromEvent(ev({ code: "NumLock", ctrlKey: true })),
		).toBeNull();
	});
});

describe("captureHotkeyFromEvent — Bug 2: uses event.code, not event.key", () => {
	it("Ctrl+Shift+2 produces ctrl+shift+2 (not ctrl+shift+@)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "Digit2", key: "@", ctrlKey: true, shiftKey: true }),
		);
		expect(captured).toBe("ctrl+shift+2");
	});

	it("Alt+L on Mac (where event.key is `¬`) produces alt+l via event.code", () => {
		// This event would only pass the `must include ctrl/meta` gate with ctrl
		// also held; the point of the test is that we read `code`, not `key`.
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyL", key: "¬", ctrlKey: true, altKey: true }),
		);
		expect(captured).toBe("ctrl+alt+l");
	});

	it("Ctrl+[ produces ctrl+bracketleft (registry form)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "BracketLeft", key: "[", ctrlKey: true }),
		);
		expect(captured).toBe("ctrl+bracketleft");
	});

	it("Ctrl+/ produces ctrl+slash", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "Slash", key: "/", ctrlKey: true }),
		);
		expect(captured).toBe("ctrl+slash");
	});

	it("Meta+Alt+ArrowUp produces meta+alt+arrowup", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "ArrowUp", key: "ArrowUp", metaKey: true, altKey: true }),
		);
		expect(captured).toBe("meta+alt+arrowup");
	});

	it("F-keys are accepted without requiring a modifier", () => {
		expect(captureHotkeyFromEvent(ev({ code: "F1", key: "F1" }))).toBe("f1");
		expect(captureHotkeyFromEvent(ev({ code: "F12", key: "F12" }))).toBe("f12");
	});

	it("requires ctrl or meta for non-F-keys", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "KeyA", key: "a", shiftKey: true })),
		).toBeNull();
		expect(
			captureHotkeyFromEvent(ev({ code: "KeyA", key: "a", altKey: true })),
		).toBeNull();
	});

	it("returns null when event.code is undefined (synthetic / autofill events)", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: undefined, ctrlKey: true })),
		).toBeNull();
	});
});

describe("captureHotkeyFromEvent — modifier ordering", () => {
	it("emits modifiers in MODIFIER_ORDER (meta, ctrl, alt, shift)", () => {
		const captured = captureHotkeyFromEvent(
			ev({
				code: "KeyK",
				key: "k",
				metaKey: true,
				ctrlKey: true,
				altKey: true,
				shiftKey: true,
			}),
		);
		expect(captured).toBe("meta+ctrl+alt+shift+k");
	});
});
