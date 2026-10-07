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

test("keeps native tokens in explicit modes while default GitHub grammar stays strict", () => {
	expect(normalizeAuthorFilters("@native_user,user.name,@me", "gitlab")).toBe(
		"native_user,user.name,@me",
	);
	expect(normalizeAuthorFilters("@native_user,user.name,@me", "unknown")).toBe(
		"native_user,user.name,@me",
	);
	expect(normalizeAuthorFilters("native_user")).toBeNull();
	expect(normalizeAuthorFilters("native_user", "mixed")).toBeNull();
	expect(normalizeAuthorFilters("dependabot[bot]", "gitlab")).toBeNull();
	expect(normalizeAuthorFilter("@me", "gitlab")).toBe("@me");
	expect(normalizeAuthorFilter("@me")).toBe("me");
});
test("native mode bounds tokens, rejects injection, and keeps current-user distinct from literal me", () => {
	expect(normalizeAuthorFilters("me,@me,ME,@me", "gitlab")).toBe("me,@me");
	expect(
		normalizeAuthorFilters("user.name author:other", "unknown"),
	).toBeNull();
	expect(normalizeAuthorFilters("a".repeat(256), "gitlab")).toBeNull();
	expect(
		normalizeAuthorFilters(
			Array.from({ length: 30 }, (_, i) => `user_${i}`).join(","),
			"unknown",
		)?.split(","),
	).toHaveLength(20);
});
