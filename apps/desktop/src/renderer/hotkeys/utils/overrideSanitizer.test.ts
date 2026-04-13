import { describe, expect, it } from "bun:test";
import { canonicalizeChord, MODIFIERS } from "./resolveHotkeyFromEvent";

/**
 * Mirrors the sanitizer in `migrate.ts` so we can unit-test the validation
 * rules without mocking tRPC / localStorage. If the migrate.ts rules ever
 * diverge from this, update both.
 */
function sanitizeOverride(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== "string" || !value.trim()) return undefined;
	const canonical = canonicalizeChord(value);
	const parts = canonical.split("+");
	const keys = parts.filter((p) => !MODIFIERS.has(p));
	if (keys.length !== 1) return undefined;
	if (!/^[a-z0-9]+$/.test(keys[0])) return undefined;
	return canonical;
}

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
		// canonicalizes to "ctrl" with no key token
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
