import { describe, expect, test } from "bun:test";
import { normalizeAuthorFilter } from "./normalizeAuthorFilter";

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
