import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { useKeyboardPreferencesStore } from "../../stores/keyboardPreferencesStore";
import { captureHotkeyFromEvent } from "./useRecordHotkeys";

/**
 * Note: `captureHotkeyFromEvent` reads `PLATFORM` via registry.ts, which in a
 * Bun test runtime without a DOM navigator resolves to "mac". The meta-on-
 * non-Mac branch is exercised indirectly via review, not here.
 */

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

describe("captureHotkeyFromEvent — lone modifiers must not auto-commit", () => {
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

describe("captureHotkeyFromEvent — chord uses event.code, not event.key", () => {
	it("Ctrl+Shift+2 chord is ctrl+shift+2 (not ctrl+shift+@)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "Digit2", key: "@", ctrlKey: true, shiftKey: true }),
		);
		expect(captured?.chord).toBe("ctrl+shift+2");
	});

	it("Alt+L on Mac (event.key=`¬`) chord is ctrl+alt+l via event.code", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyL", key: "¬", ctrlKey: true, altKey: true }),
		);
		expect(captured?.chord).toBe("ctrl+alt+l");
	});

	it("Ctrl+[ chord is ctrl+bracketleft (registry form)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "BracketLeft", key: "[", ctrlKey: true }),
		);
		expect(captured?.chord).toBe("ctrl+bracketleft");
	});

	it("Ctrl+/ chord is ctrl+slash", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "Slash", key: "/", ctrlKey: true }),
		);
		expect(captured?.chord).toBe("ctrl+slash");
	});

	it("Meta+Alt+ArrowUp chord is meta+alt+arrowup", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "ArrowUp", key: "ArrowUp", metaKey: true, altKey: true }),
		);
		expect(captured?.chord).toBe("meta+alt+arrowup");
	});

	it("F-keys are accepted without a modifier", () => {
		expect(captureHotkeyFromEvent(ev({ code: "F1", key: "F1" }))?.chord).toBe(
			"f1",
		);
		expect(captureHotkeyFromEvent(ev({ code: "F12", key: "F12" }))?.chord).toBe(
			"f12",
		);
	});

	it("returns null when event.code is undefined", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: undefined, ctrlKey: true })),
		).toBeNull();
	});
});

describe("captureHotkeyFromEvent — matchByTypedKey toggle", () => {
	let original: boolean;
	beforeEach(() => {
		original = useKeyboardPreferencesStore.getState().matchByTypedKey;
	});
	afterEach(() => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: original });
	});

	it("OFF (default): captures event.code (Dvorak KeyK + key='t' → 'meta+k')", () => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: false });
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyK", key: "t", metaKey: true }),
		);
		expect(captured?.chord).toBe("meta+k");
	});

	it("ON: captures event.key (Dvorak KeyK + key='t' → 'meta+t')", () => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: true });
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyK", key: "t", metaKey: true }),
		);
		// Recording in the same frame as dispatch — pressing the t-character
		// key on Dvorak with the toggle on stores 'meta+t', not 'meta+k'.
		expect(captured?.chord).toBe("meta+t");
	});

	it("ON: shifted typed key lower-cases (Shift+KeyK + key='T' → 'meta+shift+t')", () => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: true });
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyK", key: "T", metaKey: true, shiftKey: true }),
		);
		expect(captured?.chord).toBe("meta+shift+t");
	});

	it("ON: named keys still use event.code (Enter, F1, ArrowUp)", () => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: true });
		expect(
			captureHotkeyFromEvent(ev({ code: "Enter", key: "Enter", metaKey: true }))
				?.chord,
		).toBe("meta+enter");
		expect(captureHotkeyFromEvent(ev({ code: "F1", key: "F1" }))?.chord).toBe(
			"f1",
		);
		expect(
			captureHotkeyFromEvent(
				ev({ code: "ArrowUp", key: "ArrowUp", metaKey: true }),
			)?.chord,
		).toBe("meta+arrowup");
	});

	it("ON: dead-key / multi-char event.key falls back to event.code", () => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: true });
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyA", key: "Dead", metaKey: true }),
		);
		expect(captured?.chord).toBe("meta+a");
	});

	it("ON: '+' falls back to event.code (would collide with separator)", () => {
		useKeyboardPreferencesStore.setState({ matchByTypedKey: true });
		const captured = captureHotkeyFromEvent(
			ev({ code: "Equal", key: "+", metaKey: true, shiftKey: true }),
		);
		expect(captured?.chord).toBe("meta+shift+equal");
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
		expect(captured?.chord).toBe("meta+ctrl+alt+shift+k");
	});
});
