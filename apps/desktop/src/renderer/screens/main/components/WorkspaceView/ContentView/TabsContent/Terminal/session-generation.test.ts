import { describe, expect, it } from "bun:test";
import { matchesSessionGeneration } from "./session-generation";

describe("matchesSessionGeneration", () => {
	it("accepts events without a generation for backward compatibility", () => {
		expect(matchesSessionGeneration(null, undefined)).toBe(true);
		expect(matchesSessionGeneration("gen-1", undefined)).toBe(true);
	});

	it("rejects generated events until the active session generation is known", () => {
		expect(matchesSessionGeneration(null, "gen-1")).toBe(false);
	});

	it("accepts only the active generation once attached", () => {
		expect(matchesSessionGeneration("gen-1", "gen-1")).toBe(true);
		expect(matchesSessionGeneration("gen-1", "gen-2")).toBe(false);
	});
});
