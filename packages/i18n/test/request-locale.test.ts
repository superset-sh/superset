import { describe, expect, test } from "bun:test";
import { resolveRequestLocale } from "../src/locales";

describe("request locale agreement", () => {
	test.each([
		["fr", "ja, en;q=0.9", "fr"],
		["invalid", "ja;q=0.2, fr;q=0.9", "fr"],
		[undefined, "de ; q=0.4, fr-CA ; q=0.9", "fr"],
		[undefined, "ja;q=0, ko;q=bogus, pl;q=1.1, de;q=0.8", "de"],
		[undefined, "zh-TW, zh-CN;q=0.9", "zh-TW"],
		[undefined, "fr;q=0.8, ja;q=0.8", "fr"],
		[undefined, "zz-ZZ, ja;q=0.5", "ja"],
		[undefined, null, "en"],
		[undefined, "*", "en"],
	] as const)("%s + %s resolves to %s", (chosen, header, expected) => {
		expect(resolveRequestLocale(chosen, header)).toBe(expected);
	});
});
