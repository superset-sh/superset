import { describe, expect, it } from "bun:test";
import {
	canonicalizeHotkey,
	canonicalizeHotkeyForPlatform,
	deriveNonMacDefault,
	HOTKEYS,
	hotkeyFromKeyboardEvent,
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

// Tests for issue #1640 — align keyboard shortcuts with macOS, Warp, and VS Code conventions
describe("issue #1640 — keyboard shortcut convention violations", () => {
	// Convention: Cmd+1-9 should navigate Tabs/Conversations (like Chrome/Warp/Firefox)
	// Chrome, Warp, Firefox, Safari, iTerm2: Cmd+1-8 = jump to tab N; Cmd+9 = last tab
	// Currently: meta+1-9 navigate Workspaces (not Tabs), breaking the convention
	it("Cmd+1 (meta+1) should navigate to Tab 1, not Workspace 1", () => {
		// JUMP_TO_TAB_1 currently uses meta+alt+1, but browsers use bare meta+1
		expect(HOTKEYS.JUMP_TO_TAB_1.defaults.darwin).toBe("meta+1");
	});

	it("Cmd+9 (meta+9) should navigate to the last tab, not Workspace 9", () => {
		// Chrome/Warp: Cmd+9 always jumps to the last tab regardless of count
		// Currently meta+9 goes to JUMP_TO_WORKSPACE_9 (the 9th workspace by index)
		expect(HOTKEYS.JUMP_TO_TAB_9.defaults.darwin).toBe("meta+9");
	});

	it("Workspace navigation should not use bare Cmd+N (meta+N) shortcuts", () => {
		// Workspace shortcuts should not occupy meta+1-9 since those are reserved
		// for tab navigation by browsers (Chrome, Warp, Firefox, Safari)
		const workspaceShortcuts = [
			HOTKEYS.JUMP_TO_WORKSPACE_1.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_2.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_3.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_4.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_5.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_6.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_7.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_8.defaults.darwin,
			HOTKEYS.JUMP_TO_WORKSPACE_9.defaults.darwin,
		];
		for (const shortcut of workspaceShortcuts) {
			// None should be bare meta+digit (e.g., "meta+1" through "meta+9")
			expect(shortcut).not.toMatch(/^meta\+\d$/);
		}
	});

	// Convention: Cmd+Shift+P should be Command Palette (VS Code, Warp)
	// Currently meta+shift+p is used for OPEN_PR ("Open Pull Request")
	it("Cmd+Shift+P (meta+shift+p) should not be bound to Open Pull Request", () => {
		// VS Code and Warp use Cmd+Shift+P for Command Palette
		// Using it for "Open Pull Request" overrides this expected shortcut
		expect(HOTKEYS.OPEN_PR.defaults.darwin).not.toBe("meta+shift+p");
	});

	// Bug: Duplicate key binding — both CLOSE_PANE and CLOSE_TERMINAL use meta+w
	it("meta+w should not be bound to two different actions (CLOSE_PANE and CLOSE_TERMINAL)", () => {
		// Both CLOSE_PANE and CLOSE_TERMINAL have "meta+w" as their darwin default,
		// creating an ambiguous binding where pressing Cmd+W matches two handlers
		expect(HOTKEYS.CLOSE_PANE.defaults.darwin).not.toBe(
			HOTKEYS.CLOSE_TERMINAL.defaults.darwin,
		);
	});

	// Bug: Multiple hotkeys share the same default binding on darwin
	it("default hotkey bindings on darwin should be unique (no duplicates)", () => {
		const seen = new Map<string, string>();
		const duplicates: Array<{ keys: string; first: string; second: string }> =
			[];

		for (const [id, def] of Object.entries(HOTKEYS)) {
			const keys = def.defaults.darwin;
			if (keys === null) continue;
			const existing = seen.get(keys);
			if (existing !== undefined) {
				duplicates.push({ keys, first: existing, second: id });
			} else {
				seen.set(keys, id);
			}
		}

		expect(duplicates).toEqual([]);
	});
});
