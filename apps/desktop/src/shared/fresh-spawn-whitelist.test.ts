import { describe, expect, it } from "bun:test";
import { FRESH_EXEC_WHITELIST } from "./fresh-spawn-whitelist";

describe("FRESH_EXEC_WHITELIST", () => {
	it("is non-empty", () => {
		expect(FRESH_EXEC_WHITELIST.length).toBeGreaterThan(0);
	});

	it("is sorted alphabetically", () => {
		const sorted = [...FRESH_EXEC_WHITELIST].sort();
		expect([...FRESH_EXEC_WHITELIST]).toEqual(sorted);
	});

	it("contains gh", () => {
		expect(FRESH_EXEC_WHITELIST).toContain("gh");
	});

	it("has no duplicates", () => {
		const set = new Set(FRESH_EXEC_WHITELIST);
		expect(set.size).toBe(FRESH_EXEC_WHITELIST.length);
	});

	it("contains only short, lowercase, simple command names", () => {
		for (const cmd of FRESH_EXEC_WHITELIST) {
			expect(cmd).toMatch(/^[a-z][a-z0-9_-]*$/);
			expect(cmd.length).toBeLessThan(40);
		}
	});
});
