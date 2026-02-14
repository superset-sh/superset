import { beforeEach, describe, expect, it } from "bun:test";
import { resolveTerminalThemeType } from "./terminal-theme-type";

// Mock localStorage for Node.js test environment
const mockStorage = new Map<string, string>();
const mockLocalStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, value: string) => mockStorage.set(key, value),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
};

// @ts-expect-error - mocking global localStorage
globalThis.localStorage = mockLocalStorage;

describe("resolveTerminalThemeType", () => {
	beforeEach(() => {
		mockStorage.clear();
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
