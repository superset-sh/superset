import { describe, expect, it } from "bun:test";
import {
	canonicalizeHotkey,
	canonicalizeHotkeyForPlatform,
	deriveNonMacDefault,
	hotkeyFromKeyboardEvent,
	isTerminalReservedEvent,
	matchesHotkeyEvent,
	toElectronAccelerator,
} from "./hotkeys";

describe("canonicalizeHotkey", () => {
	it("normalizes modifier order", () => {
		expect(canonicalizeHotkey("shift+meta+k")).toBe("meta+shift+k");
	});

	it("rejects invalid hotkeys", () => {
		expect(canonicalizeHotkey("shift+meta+k+x")).toBeNull();
	});
});

describe("canonicalizeHotkeyForPlatform", () => {
	it("rejects meta on non-mac platforms", () => {
		expect(canonicalizeHotkeyForPlatform("meta+k", "win32")).toBeNull();
	});
});

describe("deriveNonMacDefault", () => {
	it("returns null for null input", () => {
		expect(deriveNonMacDefault(null)).toBeNull();
	});

	it("returns null for invalid hotkey", () => {
		expect(deriveNonMacDefault("invalid+key+combo+extra")).toBeNull();
	});

	it("returns unchanged hotkey when no meta modifier present", () => {
		expect(deriveNonMacDefault("ctrl+k")).toBe("ctrl+k");
	});

	it("maps meta+key to ctrl+shift+key (simple meta case)", () => {
		expect(deriveNonMacDefault("meta+k")).toBe("ctrl+shift+k");
	});

	it("maps meta+shift to ctrl+alt+shift (adds alt for shifted defaults)", () => {
		expect(deriveNonMacDefault("meta+shift+w")).toBe("ctrl+alt+shift+w");
	});

	it("maps meta+alt to ctrl+alt+shift", () => {
		expect(deriveNonMacDefault("meta+alt+k")).toBe("ctrl+alt+shift+k");
	});
});

describe("hotkeyFromKeyboardEvent", () => {
	it("captures a simple meta hotkey on mac", () => {
		const keys = hotkeyFromKeyboardEvent(
			{
				key: "k",
				code: "KeyK",
				metaKey: true,
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
			},
			"darwin",
		);
		expect(keys).toBe("meta+k");
	});
});

describe("toElectronAccelerator", () => {
	it("converts to electron accelerator for mac", () => {
		expect(toElectronAccelerator("meta+shift+w", "darwin")).toBe(
			"Command+Shift+W",
		);
	});

	it("returns null for meta on non-mac", () => {
		expect(toElectronAccelerator("meta+w", "win32")).toBeNull();
	});
});

describe("isTerminalReservedEvent", () => {
	it("detects ctrl+c", () => {
		expect(
			isTerminalReservedEvent({
				key: "c",
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
			}),
		).toBe(true);
	});
});

describe("Option key (macOS dead key) handling", () => {
	describe("hotkeyFromKeyboardEvent - capture path", () => {
		it("captures meta+alt+letter when event.key is Dead", () => {
			// On macOS, ⌘+⌥+e often produces event.key === "Dead"
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "Dead",
					code: "KeyE",
					metaKey: true,
					ctrlKey: false,
					altKey: true,
					shiftKey: false,
				},
				"darwin",
			);
			expect(keys).toBe("meta+alt+e");
		});

		it("captures meta+alt+letter when event.key is a modified character", () => {
			// On macOS, ⌘+⌥+a might produce event.key === "å"
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "å",
					code: "KeyA",
					metaKey: true,
					ctrlKey: false,
					altKey: true,
					shiftKey: false,
				},
				"darwin",
			);
			// Should resolve via event.code when primary modifier is held
			expect(keys).toBe("meta+alt+a");
		});

		it("captures ctrl+alt+letter when event.key is Dead on linux", () => {
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "Dead",
					code: "KeyN",
					metaKey: false,
					ctrlKey: true,
					altKey: true,
					shiftKey: false,
				},
				"linux",
			);
			expect(keys).toBe("ctrl+alt+n");
		});

		it("captures meta+backquote when event.key is Dead (common dead key)", () => {
			// Backquote is a common dead key trigger on macOS with Option
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "Dead",
					code: "Backquote",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"darwin",
			);
			expect(keys).toBe("meta+`");
		});

		it("returns null for alt-only combinations (no primary modifier)", () => {
			// Alt-only without ctrl/meta should return null (reserved for terminal)
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "Dead",
					code: "KeyE",
					metaKey: false,
					ctrlKey: false,
					altKey: true,
					shiftKey: false,
				},
				"darwin",
			);
			expect(keys).toBeNull();
		});

		it("returns null when both key and code are unusable", () => {
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "Dead",
					code: "UnknownCode",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"darwin",
			);
			expect(keys).toBeNull();
		});
	});

	describe("matchesHotkeyEvent - match path", () => {
		it("matches meta+alt+e when event.key is Dead", () => {
			const matches = matchesHotkeyEvent(
				{
					key: "Dead",
					code: "KeyE",
					metaKey: true,
					ctrlKey: false,
					altKey: true,
					shiftKey: false,
				},
				"meta+alt+e",
			);
			expect(matches).toBe(true);
		});

		it("matches meta+alt+a when event.key is modified character", () => {
			const matches = matchesHotkeyEvent(
				{
					key: "å",
					code: "KeyA",
					metaKey: true,
					ctrlKey: false,
					altKey: true,
					shiftKey: false,
				},
				"meta+alt+a",
			);
			expect(matches).toBe(true);
		});

		it("matches standard meta+k when event.key is normal", () => {
			// Standard case should still work
			const matches = matchesHotkeyEvent(
				{
					key: "k",
					code: "KeyK",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"meta+k",
			);
			expect(matches).toBe(true);
		});

		it("matches arrow keys via event.code", () => {
			const matches = matchesHotkeyEvent(
				{
					key: "ArrowLeft",
					code: "ArrowLeft",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"meta+left",
			);
			expect(matches).toBe(true);
		});

		it("matches slash via event.code", () => {
			const matches = matchesHotkeyEvent(
				{
					key: "/",
					code: "Slash",
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"meta+slash",
			);
			expect(matches).toBe(true);
		});

		it("does not match when modifiers differ", () => {
			const matches = matchesHotkeyEvent(
				{
					key: "Dead",
					code: "KeyE",
					metaKey: true,
					ctrlKey: false,
					altKey: false, // Missing alt
					shiftKey: false,
				},
				"meta+alt+e",
			);
			expect(matches).toBe(false);
		});
	});

	describe("cross-layout keyboard compatibility", () => {
		it("uses event.key for ASCII letters (preserves system shortcut behavior)", () => {
			// On QWERTZ keyboard, physical Y position produces "z" character
			// Cmd+Z should capture as "z" (character), not "y" (physical position)
			const keys = hotkeyFromKeyboardEvent(
				{
					key: "z",
					code: "KeyY", // Physical Y position on QWERTZ
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"darwin",
			);
			expect(keys).toBe("meta+z"); // Character-based, not "meta+y"
		});

		it("matches based on character, not physical position", () => {
			// A hotkey set on QWERTY as "meta+z" should match on QWERTZ
			// when user presses the key that produces "z" (physical Y position)
			const matches = matchesHotkeyEvent(
				{
					key: "z",
					code: "KeyY", // Physical Y position on QWERTZ
					metaKey: true,
					ctrlKey: false,
					altKey: false,
					shiftKey: false,
				},
				"meta+z",
			);
			expect(matches).toBe(true);
		});
	});

	describe("capture and match roundtrip", () => {
		it("captured hotkey matches the same event", () => {
			const event = {
				key: "Dead",
				code: "KeyE",
				metaKey: true,
				ctrlKey: false,
				altKey: true,
				shiftKey: false,
			};
			const captured = hotkeyFromKeyboardEvent(event, "darwin");
			expect(captured).toBe("meta+alt+e");
			if (captured) {
				const matches = matchesHotkeyEvent(event, captured);
				expect(matches).toBe(true);
			}
		});

		it("captured hotkey with modified character matches the same event", () => {
			const event = {
				key: "ø",
				code: "KeyO",
				metaKey: true,
				ctrlKey: false,
				altKey: true,
				shiftKey: false,
			};
			const captured = hotkeyFromKeyboardEvent(event, "darwin");
			expect(captured).toBe("meta+alt+o");
			if (captured) {
				const matches = matchesHotkeyEvent(event, captured);
				expect(matches).toBe(true);
			}
		});
	});
});
