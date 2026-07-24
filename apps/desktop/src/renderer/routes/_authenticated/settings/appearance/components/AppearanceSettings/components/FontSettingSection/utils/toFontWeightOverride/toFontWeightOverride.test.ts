import { describe, expect, it } from "bun:test";
import { toFontWeightOverride } from "./toFontWeightOverride";

describe("toFontWeightOverride", () => {
	it("keeps the displayed default as an inherited setting", () => {
		expect(toFontWeightOverride("400")).toBeNull();
	});

	it("returns non-default weights as explicit overrides", () => {
		expect(toFontWeightOverride("500")).toBe(500);
	});
});
