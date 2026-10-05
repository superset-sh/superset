import { describe, expect, test } from "bun:test";
import { isPageScope, PAGE_SCOPES, serverScope } from "./pageScope";

describe("isPageScope", () => {
	test("accepts every tab", () => {
		for (const scope of PAGE_SCOPES) expect(isPageScope(scope)).toBe(true);
	});

	test("rejects anything else", () => {
		expect(isPageScope("archived")).toBe(false);
		expect(isPageScope("")).toBe(false);
		expect(isPageScope(undefined)).toBe(false);
		expect(isPageScope(null)).toBe(false);
		expect(isPageScope(1)).toBe(false);
	});
});

describe("serverScope", () => {
	test("passes the scopes the server filters on straight through", () => {
		expect(serverScope("all")).toBe("all");
		expect(serverScope("team")).toBe("team");
		expect(serverScope("mine")).toBe("mine");
	});

	test("pinned is not a server scope — it narrows by id instead", () => {
		expect(serverScope("pinned")).toBe("all");
	});
});
