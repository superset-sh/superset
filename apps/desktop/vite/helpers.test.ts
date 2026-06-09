import { describe, expect, it } from "bun:test";
import { defineEnv, resolveEnvValue } from "./helpers";

describe("desktop Vite env helpers", () => {
	it("uses fallback values when CI secrets expand to empty strings", () => {
		expect(defineEnv("", "https://api.superset.sh")).toBe(
			JSON.stringify("https://api.superset.sh"),
		);
		expect(defineEnv("   ", "https://relay.superset.sh")).toBe(
			JSON.stringify("https://relay.superset.sh"),
		);
	});

	it("preserves explicit non-empty overrides after trimming accidental whitespace", () => {
		expect(
			defineEnv(" https://api.example.com ", "https://api.superset.sh"),
		).toBe(JSON.stringify("https://api.example.com"));
		expect(
			resolveEnvValue(
				" https://relay.example.com ",
				"https://relay.superset.sh",
			),
		).toBe("https://relay.example.com");
	});

	it("keeps undefined for optional env values without a fallback", () => {
		expect(defineEnv("", undefined)).toBe(undefined);
		expect(defineEnv(undefined, undefined)).toBe(undefined);
	});
});
