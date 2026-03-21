import { describe, expect, it } from "bun:test";
import {
	canonicalizeHotkey,
	canonicalizeHotkeyForPlatform,
	deriveNonMacDefault,
	getDefaultHotkey,
	HOTKEYS,
	type HotkeyId,
	type HotkeyPlatform,
	hotkeyFromKeyboardEvent,
	isOsReservedHotkey,
	isTerminalReservedEvent,
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

describe("Linux OS reserved chord coverage", () => {
	it("includes ctrl+alt+up and ctrl+alt+down as OS reserved on Linux (GNOME workspace switching)", () => {
		expect(isOsReservedHotkey("ctrl+alt+up", "linux")).toBe(true);
		expect(isOsReservedHotkey("ctrl+alt+down", "linux")).toBe(true);
	});
});

describe("default hotkeys do not collide with OS reserved shortcuts", () => {
	const platforms: HotkeyPlatform[] = ["darwin", "win32", "linux"];
	for (const platform of platforms) {
		it(`no default ${platform} hotkey is OS-reserved`, () => {
			const collisions: string[] = [];
			for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
				const keys = getDefaultHotkey(id, platform);
				if (keys && isOsReservedHotkey(keys, platform)) {
					collisions.push(`${id} (${keys})`);
				}
			}
			expect(collisions).toEqual([]);
		});
	}
});

describe("PREV_WORKSPACE and NEXT_WORKSPACE Linux defaults", () => {
	it("should have explicit Linux defaults that avoid ctrl+alt+up/down", () => {
		const prev = getDefaultHotkey("PREV_WORKSPACE", "linux");
		const next = getDefaultHotkey("NEXT_WORKSPACE", "linux");
		expect(prev).not.toBe("ctrl+alt+up");
		expect(next).not.toBe("ctrl+alt+down");
		expect(prev).not.toBeNull();
		expect(next).not.toBeNull();
	});
});
