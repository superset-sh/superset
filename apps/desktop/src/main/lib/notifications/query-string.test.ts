import { describe, expect, it } from "bun:test";
import { queryString } from "./query-string";

describe("queryString", () => {
	it("keeps a plain string value", () => {
		expect(queryString("pane-1")).toBe("pane-1");
		expect(queryString("")).toBe("");
	});

	it("drops the array express builds from repeated keys", () => {
		expect(queryString(["pane-1", "pane-2"])).toBeUndefined();
	});

	it("drops the object express builds from bracket syntax", () => {
		expect(queryString({ x: "1" })).toBeUndefined();
	});

	it("drops absent values", () => {
		expect(queryString(undefined)).toBeUndefined();
		expect(queryString(null)).toBeUndefined();
	});
});
