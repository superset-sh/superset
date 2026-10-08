import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { resolveTerminalThemeType } from "./terminal-theme-type";

const themeTypeBefore = localStorage.getItem("theme-type");

afterAll(() => {
	if (themeTypeBefore === null) localStorage.removeItem("theme-type");
	else localStorage.setItem("theme-type", themeTypeBefore);
});

describe("resolveTerminalThemeType", () => {
	beforeEach(() => {
		localStorage.removeItem("theme-type");
	});

	it("prefers active theme type when provided", () => {
		localStorage.setItem("theme-type", "dark");
		const result = resolveTerminalThemeType({ activeThemeType: "light" });
		expect(result).toBe("light");
	});

	it("falls back to persisted theme-type when active theme is unavailable", () => {
		localStorage.setItem("theme-type", "light");
		const result = resolveTerminalThemeType();
		expect(result).toBe("light");
	});

	it("falls back to dark when persisted theme-type is invalid", () => {
		localStorage.setItem("theme-type", "invalid");
		const result = resolveTerminalThemeType();
		expect(result).toBe("dark");
	});

	it("falls back to dark when localStorage is empty", () => {
		const result = resolveTerminalThemeType();
		expect(result).toBe("dark");
	});
});
