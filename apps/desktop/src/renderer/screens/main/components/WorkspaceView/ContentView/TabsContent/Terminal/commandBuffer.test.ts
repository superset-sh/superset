import { describe, expect, it } from "bun:test";
import { sanitizeForTitle } from "./commandBuffer";

describe("sanitizeForTitle", () => {
	it("should keep lowercase alphanumeric and common chars", () => {
		expect(sanitizeForTitle("ls -la ./src")).toBe("ls -la ./src");
	});

	it("should strip uppercase (escape codes use A-Z)", () => {
		expect(sanitizeForTitle("open[Code")).toBe("openode");
	});

	it("should strip special characters", () => {
		expect(sanitizeForTitle("[?1016;2$y command")).toBe("10162y command");
	});

	it("should truncate to max length", () => {
		const longCommand = "a".repeat(100);
		const result = sanitizeForTitle(longCommand);
		expect(result?.length).toBe(32);
	});

	it("should return null for empty result", () => {
		expect(sanitizeForTitle("[]$;?")).toBeNull();
	});

	it("should return null for whitespace-only result", () => {
		expect(sanitizeForTitle("   ")).toBeNull();
	});

	it("should trim whitespace", () => {
		expect(sanitizeForTitle("  command  ")).toBe("command");
	});
});
