import { describe, expect, test } from "bun:test";
import { rankBySlugMatch } from "./rankBySlugMatch";

describe("rankBySlugMatch", () => {
	test("an exact key outranks its own prefix siblings", () => {
		expect(rankBySlugMatch("DEMO-1", "DEMO-1")).toBeLessThan(
			rankBySlugMatch("DEMO-199", "DEMO-1"),
		);
	});

	test("orders exact, prefix, contains, then everything else", () => {
		expect(rankBySlugMatch("SUPER-2390", "super-2390")).toBe(0);
		expect(rankBySlugMatch("SUPER-23901", "SUPER-2390")).toBe(1);
		expect(rankBySlugMatch("X-SUPER-2390", "SUPER-2390")).toBe(2);
		expect(rankBySlugMatch("OTHER-1", "SUPER-2390")).toBe(3);
	});

	test("is case- and whitespace-insensitive", () => {
		expect(rankBySlugMatch("demo-1", "  DEMO-1 ")).toBe(0);
	});

	test("an empty query ranks everything equally so recency decides", () => {
		expect(rankBySlugMatch("DEMO-1", "   ")).toBe(3);
	});
});
