import { describe, expect, test } from "bun:test";
import { TERMINAL_OPTIONS } from "./config";

describe("legacy terminal config", () => {
	test("rescales overlapping fallback glyphs", () => {
		expect(TERMINAL_OPTIONS.rescaleOverlappingGlyphs).toBe(true);
	});
});
