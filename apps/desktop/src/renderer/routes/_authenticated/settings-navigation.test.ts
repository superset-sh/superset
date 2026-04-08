import { describe, expect, it } from "bun:test";
import {
	resolveOpenSettingsTarget,
	resolveToggleSettingsTarget,
} from "./settings-navigation";

describe("resolveOpenSettingsTarget", () => {
	it("opens the requested settings section even when already in settings", () => {
		expect(resolveOpenSettingsTarget("keyboard")).toBe("/settings/keyboard");
	});

	it("defaults to account settings when no section is provided", () => {
		expect(resolveOpenSettingsTarget()).toBe("/settings/account");
	});
});

describe("resolveToggleSettingsTarget", () => {
	it("closes settings back to the origin route when already in settings", () => {
		expect(
			resolveToggleSettingsTarget("/settings/appearance", "/workspace/123"),
		).toBe("/workspace/123");
	});

	it("opens account settings when triggered outside settings", () => {
		expect(
			resolveToggleSettingsTarget("/workspace/123", "/workspace/123"),
		).toBe("/settings/account");
	});
});
