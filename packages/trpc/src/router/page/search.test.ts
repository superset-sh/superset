import { describe, expect, test } from "bun:test";
import { likePattern } from "./search";

describe("likePattern", () => {
	test("wraps the query in wildcards for a contains match", () => {
		expect(likePattern("onboarding")).toBe("%onboarding%");
	});

	test("escapes LIKE metacharacters so they match literally", () => {
		expect(likePattern("100%_done\\")).toBe("%100\\%\\_done\\\\%");
	});
});
