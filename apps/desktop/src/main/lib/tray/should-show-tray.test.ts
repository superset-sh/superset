import { describe, expect, test } from "bun:test";
import { shouldShowTray } from "./should-show-tray";

describe("shouldShowTray", () => {
	test("shows tray on macOS when the preference is enabled", () => {
		expect(shouldShowTray({ platform: "darwin", showTrayIcon: true })).toBe(
			true,
		);
	});

	// Reproduces #5205: a user must be able to disable the menu bar icon.
	// Before the `showTrayIcon` preference existed, the tray was always created
	// on macOS regardless of any setting, so there was no way to free up the
	// menu bar space.
	test("hides tray on macOS when the preference is disabled", () => {
		expect(shouldShowTray({ platform: "darwin", showTrayIcon: false })).toBe(
			false,
		);
	});

	test("never shows tray on non-macOS platforms", () => {
		expect(shouldShowTray({ platform: "win32", showTrayIcon: true })).toBe(
			false,
		);
		expect(shouldShowTray({ platform: "linux", showTrayIcon: true })).toBe(
			false,
		);
	});
});
