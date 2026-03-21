import { describe, expect, it } from "bun:test";
import {
	canonicalizeHotkey,
	canonicalizeHotkeyForPlatform,
	deriveNonMacDefault,
	HOTKEYS,
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

describe("attention workspace hotkeys", () => {
	it("defines NEXT_ATTENTION_WORKSPACE with correct darwin default", () => {
		expect(HOTKEYS.NEXT_ATTENTION_WORKSPACE.defaults.darwin).toBe(
			"meta+alt+shift+down",
		);
	});

	it("defines PREV_ATTENTION_WORKSPACE with correct darwin default", () => {
		expect(HOTKEYS.PREV_ATTENTION_WORKSPACE.defaults.darwin).toBe(
			"meta+alt+shift+up",
		);
	});

	it("derives non-mac defaults for attention workspace hotkeys", () => {
		// meta+alt+shift → ctrl+alt+shift (meta→ctrl+shift, but shift already present adds alt)
		expect(HOTKEYS.NEXT_ATTENTION_WORKSPACE.defaults.win32).toBe(
			deriveNonMacDefault("meta+alt+shift+down"),
		);
		expect(HOTKEYS.PREV_ATTENTION_WORKSPACE.defaults.win32).toBe(
			deriveNonMacDefault("meta+alt+shift+up"),
		);
	});

	it("matches keyboard event for NEXT_ATTENTION_WORKSPACE on mac", () => {
		const keys = HOTKEYS.NEXT_ATTENTION_WORKSPACE.defaults.darwin ?? "";
		expect(keys).not.toBe("");
		expect(
			matchesHotkeyEvent(
				{
					key: "ArrowDown",
					metaKey: true,
					altKey: true,
					shiftKey: true,
					ctrlKey: false,
				},
				keys,
			),
		).toBe(true);
	});

	it("matches keyboard event for PREV_ATTENTION_WORKSPACE on mac", () => {
		const keys = HOTKEYS.PREV_ATTENTION_WORKSPACE.defaults.darwin ?? "";
		expect(keys).not.toBe("");
		expect(
			matchesHotkeyEvent(
				{
					key: "ArrowUp",
					metaKey: true,
					altKey: true,
					shiftKey: true,
					ctrlKey: false,
				},
				keys,
			),
		).toBe(true);
	});

	it("categorizes attention workspace hotkeys under Workspace", () => {
		expect(HOTKEYS.NEXT_ATTENTION_WORKSPACE.category).toBe("Workspace");
		expect(HOTKEYS.PREV_ATTENTION_WORKSPACE.category).toBe("Workspace");
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
