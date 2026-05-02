import { describe, expect, it } from "bun:test";
import {
	captureHotkeyFromEvent,
	resolveCapturedBinding,
} from "./useRecordHotkeys";

/**
 * Covers the regressions fixed in
 * apps/desktop/plans/20260412-keyboard-recorder-ctrl-binding-fix.md plus
 * Phase 2 additions (logical/named classification, dual-form capture).
 *
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

describe("captureHotkeyFromEvent — codeChord uses event.code, not event.key", () => {
	it("Ctrl+Shift+2 codeChord is ctrl+shift+2 (not ctrl+shift+@)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "Digit2", key: "@", ctrlKey: true, shiftKey: true }),
		);
		expect(captured?.codeChord).toBe("ctrl+shift+2");
	});

	it("Alt+L on Mac (event.key=`¬`) codeChord is ctrl+alt+l via event.code", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyL", key: "¬", ctrlKey: true, altKey: true }),
		);
		expect(captured?.codeChord).toBe("ctrl+alt+l");
	});

	it("Ctrl+[ codeChord is ctrl+bracketleft (registry form)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "BracketLeft", key: "[", ctrlKey: true }),
		);
		expect(captured?.codeChord).toBe("ctrl+bracketleft");
	});

	it("Ctrl+/ codeChord is ctrl+slash", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "Slash", key: "/", ctrlKey: true }),
		);
		expect(captured?.codeChord).toBe("ctrl+slash");
	});

	it("Meta+Alt+ArrowUp codeChord is meta+alt+arrowup", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "ArrowUp", key: "ArrowUp", metaKey: true, altKey: true }),
		);
		expect(captured?.codeChord).toBe("meta+alt+arrowup");
	});

	it("F-keys are accepted without a modifier", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "F1", key: "F1" }))?.codeChord,
		).toBe("f1");
		expect(
			captureHotkeyFromEvent(ev({ code: "F12", key: "F12" }))?.codeChord,
		).toBe("f12");
	});

	it("returns null when event.code is undefined", () => {
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
		expect(captured?.codeChord).toBe("meta+ctrl+alt+shift+k");
	});
});

describe("captureHotkeyFromEvent — classification & dual-form capture", () => {
	it("classifies F-keys", () => {
		const captured = captureHotkeyFromEvent(ev({ code: "F5", key: "F5" }));
		expect(captured?.classification).toBe("fkey");
	});

	it("classifies named keys (Enter, ArrowUp, Backspace, ...)", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "Enter", key: "Enter", metaKey: true }))
				?.classification,
		).toBe("named");
		expect(
			captureHotkeyFromEvent(
				ev({ code: "ArrowUp", key: "ArrowUp", metaKey: true }),
			)?.classification,
		).toBe("named");
	});

	it("classifies letters/digits/punctuation as printable", () => {
		expect(
			captureHotkeyFromEvent(ev({ code: "KeyP", key: "p", metaKey: true }))
				?.classification,
		).toBe("printable");
		expect(
			captureHotkeyFromEvent(ev({ code: "Slash", key: "/", ctrlKey: true }))
				?.classification,
		).toBe("printable");
	});

	it("named/fkey: keyChord matches codeChord", () => {
		const named = captureHotkeyFromEvent(
			ev({ code: "Enter", key: "Enter", metaKey: true }),
		);
		expect(named?.keyChord).toBe(named?.codeChord);
		const fkey = captureHotkeyFromEvent(ev({ code: "F1", key: "F1" }));
		expect(fkey?.keyChord).toBe(fkey?.codeChord);
	});

	it("printable: keyChord uses event.key (Dvorak: KeyR + key='p' → meta+p)", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyR", key: "p", metaKey: true }),
		);
		expect(captured?.codeChord).toBe("meta+r");
		expect(captured?.keyChord).toBe("meta+p");
	});

	it("printable: keyChord lowercases shifted glyphs (Shift+P → 'P' → 'p')", () => {
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyP", key: "P", metaKey: true, shiftKey: true }),
		);
		expect(captured?.keyChord).toBe("meta+shift+p");
	});

	it("printable with multi-char event.key falls back to codeChord", () => {
		// Dead-key composition or "Process" can produce non-single-char event.key
		const captured = captureHotkeyFromEvent(
			ev({ code: "KeyA", key: "Dead", metaKey: true }),
		);
		expect(captured?.keyChord).toBe(captured?.codeChord);
	});

	it("printable '+' falls back to codeChord (would collide with chord separator)", () => {
		// Shift+= on US produces event.key "+" — accepting it as a logical
		// token would build "meta+shift++" which can't be parsed back.
		const captured = captureHotkeyFromEvent(
			ev({ code: "Equal", key: "+", metaKey: true, shiftKey: true }),
		);
		expect(captured?.codeChord).toBe("meta+shift+equal");
		expect(captured?.keyChord).toBe(captured?.codeChord);
	});
});

describe("resolveCapturedBinding", () => {
	function capture(init: StubInit) {
		const captured = captureHotkeyFromEvent(ev(init));
		if (!captured) {
			throw new Error("expected captureHotkeyFromEvent to succeed");
		}
		return captured;
	}

	it("F-keys force named regardless of preferredMode", () => {
		const captured = capture({ code: "F5", key: "F5" });
		expect(resolveCapturedBinding(captured, "logical").mode).toBe("named");
		expect(resolveCapturedBinding(captured, "physical").mode).toBe("named");
	});

	it("Named keys force named regardless of preferredMode", () => {
		const captured = capture({ code: "Enter", key: "Enter", metaKey: true });
		expect(resolveCapturedBinding(captured, "logical").mode).toBe("named");
		expect(resolveCapturedBinding(captured, "physical").mode).toBe("named");
	});

	it("Printable + logical → keyChord", () => {
		const captured = capture({ code: "KeyR", key: "p", metaKey: true });
		const resolved = resolveCapturedBinding(captured, "logical");
		expect(resolved.mode).toBe("logical");
		expect(resolved.chord).toBe("meta+p");
	});

	it("Printable + physical → codeChord", () => {
		const captured = capture({ code: "KeyR", key: "p", metaKey: true });
		const resolved = resolveCapturedBinding(captured, "physical");
		expect(resolved.mode).toBe("physical");
		expect(resolved.chord).toBe("meta+r");
	});
});
