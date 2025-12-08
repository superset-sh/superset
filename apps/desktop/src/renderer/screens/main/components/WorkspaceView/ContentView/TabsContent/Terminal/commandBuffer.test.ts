import { describe, expect, it } from "bun:test";
import { sanitizeForTitle } from "./commandBuffer";

describe("sanitizeForTitle", () => {
	it("should keep normal text unchanged", () => {
		expect(sanitizeForTitle("ls -la ./src")).toBe("ls -la ./src");
	});

	it("should keep uppercase letters", () => {
		expect(sanitizeForTitle("openCode")).toBe("openCode");
	});

	it("should keep special characters", () => {
		expect(sanitizeForTitle("npm install @scope/pkg")).toBe(
			"npm install @scope/pkg",
		);
	});

	it("should strip ANSI escape sequences", () => {
		expect(sanitizeForTitle("\x1b[32mgreen\x1b[0m")).toBe("green");
		expect(sanitizeForTitle("\x1b[1;34mbold blue\x1b[0m")).toBe("bold blue");
	});

	it("should truncate to max length", () => {
		const longCommand = "a".repeat(100);
		const result = sanitizeForTitle(longCommand);
		expect(result?.length).toBe(32);
	});

	it("should return null for empty result", () => {
		expect(sanitizeForTitle("")).toBeNull();
	});

	it("should return null for whitespace-only result", () => {
		expect(sanitizeForTitle("   ")).toBeNull();
	});

	it("should trim whitespace", () => {
		expect(sanitizeForTitle("  command  ")).toBe("command");
	});
});
