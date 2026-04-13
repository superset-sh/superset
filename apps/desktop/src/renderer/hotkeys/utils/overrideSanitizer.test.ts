import { describe, expect, it } from "bun:test";
import { sanitizeOverride } from "./sanitizeOverride";

describe("sanitizeOverride (migration validation)", () => {
	it("preserves an explicit unassignment (null)", () => {
		expect(sanitizeOverride(null)).toBeNull();
	});

	it("drops empty / non-string values", () => {
		expect(sanitizeOverride(undefined)).toBeUndefined();
		expect(sanitizeOverride("")).toBeUndefined();
		expect(sanitizeOverride("   ")).toBeUndefined();
		expect(sanitizeOverride(42)).toBeUndefined();
		expect(sanitizeOverride({})).toBeUndefined();
	});

	it("canonicalizes valid chords", () => {
		expect(sanitizeOverride("meta+k")).toBe("meta+k");
		expect(sanitizeOverride("shift+ctrl+k")).toBe("ctrl+shift+k");
		expect(sanitizeOverride("meta+alt+up")).toBe("alt+meta+arrowup");
	});

	it("accepts multi-char key tokens (bracketleft, f12)", () => {
		expect(sanitizeOverride("meta+bracketleft")).toBe("meta+bracketleft");
		expect(sanitizeOverride("f12")).toBe("f12");
	});

	it("drops pre-fix `ctrl+control` garbage (no real key)", () => {
		expect(sanitizeOverride("ctrl+control")).toBeUndefined();
	});

	it("drops chords with single-char punctuation keys (pre-fix event.key output)", () => {
		expect(sanitizeOverride("ctrl+shift+@")).toBeUndefined();
		expect(sanitizeOverride("meta+[")).toBeUndefined();
		expect(sanitizeOverride("alt+¬")).toBeUndefined();
	});

	it("drops chords with only modifiers", () => {
		expect(sanitizeOverride("ctrl+shift")).toBeUndefined();
		expect(sanitizeOverride("meta")).toBeUndefined();
	});
});
