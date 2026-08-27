import { describe, expect, test } from "bun:test";
import { getSandboxContainerName, sandboxNameSlug } from "./paths.ts";

describe("sandboxNameSlug", () => {
	test("sanitizes to docker-safe lowercase and dedupes parts", () => {
		expect(sandboxNameSlug("Add tests", "feat/add-tests")).toBe(
			"add-tests-feat-add-tests",
		);
		expect(sandboxNameSlug("main", "main")).toBe("main");
		expect(sandboxNameSlug(null, "Fix (WS) #12!")).toBe("fix-ws-12");
	});

	test("truncates long inputs without a trailing dash", () => {
		const slug = sandboxNameSlug("a".repeat(28), "branch-name-that-is-long");
		expect(slug.length).toBeLessThanOrEqual(30);
		expect(slug.endsWith("-")).toBe(false);
	});
});

describe("getSandboxContainerName", () => {
	test("slugged name keeps a short unique id suffix", () => {
		expect(
			getSandboxContainerName(
				"9431dce6-39c7-4fd9-b31c-4abc80b73170",
				"add-tests",
			),
		).toBe("superset-add-tests-9431dce6");
	});

	test("falls back to the id-only form without a slug", () => {
		expect(getSandboxContainerName("abc")).toBe("superset-ws-abc");
	});
});
