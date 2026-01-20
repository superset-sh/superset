import { describe, expect, test } from "bun:test";
import { generateBranchName } from "./branch";

describe("generateBranchName", () => {
	test("returns a string", () => {
		const name = generateBranchName();
		expect(typeof name).toBe("string");
		expect(name.length).toBeGreaterThan(0);
	});

	test("avoids existing branches", () => {
		// Generate a name first
		const existing = [generateBranchName()];
		// Generate many names and ensure they're all different from existing
		for (let i = 0; i < 100; i++) {
			const name = generateBranchName(existing);
			expect(existing.includes(name)).toBe(false);
		}
	});

	test("handles case-insensitive collision detection", () => {
		const existing = ["BRANCH", "Test", "HELLO"];
		const name = generateBranchName(existing);
		// Should not match any of the existing (case-insensitive)
		expect(existing.some((b) => b.toLowerCase() === name.toLowerCase())).toBe(
			false,
		);
	});
});
