import { describe, expect, test } from "bun:test";
import {
	normalizeAuthorFilter,
	normalizeAuthorFilters,
} from "./normalizeAuthorFilter";

describe("normalizeAuthorFilter", () => {
	test("normalizes GitHub usernames and bot logins", () => {
		expect(normalizeAuthorFilter(" @octo-cat ")).toBe("octo-cat");
		expect(normalizeAuthorFilter("dependabot[bot]")).toBe("dependabot[bot]");
	});

	test("rejects empty and query-injection values", () => {
		expect(normalizeAuthorFilter("  ")).toBeNull();
		expect(normalizeAuthorFilter("octo--cat")).toBeNull();
		expect(normalizeAuthorFilter("octocat author:someone-else")).toBeNull();
		expect(normalizeAuthorFilter(42)).toBeNull();
	});
});

describe("normalizeAuthorFilters", () => {
	test("preserves legacy single-author links and normalizes multiple authors", () => {
		expect(normalizeAuthorFilters(" @octocat ")).toBe("octocat");
		expect(
			normalizeAuthorFilters(" @octocat, teammate, OCTOCAT, dependabot[bot] "),
		).toBe("octocat,teammate,dependabot[bot]");
	});
	test("rejects malformed lists and injected search qualifiers", () => {
		for (const value of [
			null,
			42,
			"",
			"alice,",
			"alice,bob author:carol",
			"alice,octo--cat",
		]) {
			expect(normalizeAuthorFilters(value)).toBeNull();
		}
	});
	test("bounds persisted selections", () => {
		expect(
			normalizeAuthorFilters(
				Array.from({ length: 30 }, (_, i) => `user${i}`).join(","),
			)?.split(","),
		).toHaveLength(20);
	});
});
