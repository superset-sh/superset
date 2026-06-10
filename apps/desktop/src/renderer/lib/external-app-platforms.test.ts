import { describe, expect, test } from "bun:test";
import {
	filterExternalAppsForPlatform,
	isExternalAppAvailableOnPlatform,
} from "./external-app-platforms";

describe("external app platform availability", () => {
	test("keeps macOS-only apps on macOS", () => {
		expect(isExternalAppAvailableOnPlatform("xcode", "MacIntel")).toBe(true);
		expect(isExternalAppAvailableOnPlatform("iterm", "darwin")).toBe(true);
	});

	test("hides macOS-only apps on Windows and Linux", () => {
		expect(isExternalAppAvailableOnPlatform("xcode", "Win32")).toBe(false);
		expect(isExternalAppAvailableOnPlatform("iterm", "Linux x86_64")).toBe(
			false,
		);
		expect(isExternalAppAvailableOnPlatform("terminal", "win32")).toBe(false);
	});

	test("keeps cross-platform editor apps visible on Windows", () => {
		expect(isExternalAppAvailableOnPlatform("vscode", "Win32")).toBe(true);
		expect(isExternalAppAvailableOnPlatform("cursor", "win32")).toBe(true);
		expect(isExternalAppAvailableOnPlatform("pycharm", "win32")).toBe(true);
	});

	test("filters option lists by platform", () => {
		const filtered = filterExternalAppsForPlatform(
			[
				{ id: "finder" as const },
				{ id: "xcode" as const },
				{ id: "vscode" as const },
			],
			"Win32",
		);

		expect(filtered.map((option) => option.id)).toEqual(["finder", "vscode"]);
	});
});
