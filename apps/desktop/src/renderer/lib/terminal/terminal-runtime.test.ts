import { describe, expect, test } from "bun:test";
import { TERMINAL_RENDERING_OPTIONS } from "./xterm-options";

describe("terminal runtime rendering options", () => {
	test("rescales overlapping fallback glyphs in renderer terminals", () => {
		expect(TERMINAL_RENDERING_OPTIONS.rescaleOverlappingGlyphs).toBe(true);
	});
});
