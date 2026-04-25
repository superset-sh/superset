import { describe, expect, it } from "bun:test";
import { normalizeTerminalTitle } from "./terminal-title";

describe("normalizeTerminalTitle", () => {
	it("normalizes empty and missing titles to null", () => {
		expect(normalizeTerminalTitle(null)).toBeNull();
		expect(normalizeTerminalTitle(undefined)).toBeNull();
		expect(normalizeTerminalTitle(" \n\t ")).toBeNull();
	});

	it("collapses control characters and caps title length", () => {
		const longTitle = `${"a".repeat(130)}\n\tb`;

		expect(normalizeTerminalTitle(longTitle)).toBe("a".repeat(120));
	});
});
