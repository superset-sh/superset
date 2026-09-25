import { describe, expect, test } from "bun:test";
import { parsePositiveIntegerParam } from "./parsePositiveIntegerParam";

describe("parsePositiveIntegerParam", () => {
	test("accepts positive safe integers", () => {
		expect(parsePositiveIntegerParam("5975")).toBe(5975);
	});

	test("rejects partial, non-positive, and unsafe values", () => {
		expect(parsePositiveIntegerParam("12abc")).toBeNull();
		expect(parsePositiveIntegerParam("0")).toBeNull();
		expect(parsePositiveIntegerParam("-1")).toBeNull();
		expect(
			parsePositiveIntegerParam(String(Number.MAX_SAFE_INTEGER + 1)),
		).toBeNull();
	});
});
