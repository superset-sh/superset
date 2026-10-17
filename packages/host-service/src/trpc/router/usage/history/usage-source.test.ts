import { describe, expect, test } from "bun:test";
import { usageSourceOf } from "./aggregate";

describe("usageSourceOf", () => {
	test("marks account-scoped agents so hosts do not sum them", () => {
		expect(usageSourceOf("cursor")).toBe("account-api");
		expect(usageSourceOf("claude")).toBe("local-logs");
	});
});
