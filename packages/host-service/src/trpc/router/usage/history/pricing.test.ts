import { describe, expect, test } from "bun:test";
import { matchModelRate } from "./pricing";

describe("matchModelRate", () => {
	test("matches vendor-qualified ids from multi-model harnesses", () => {
		const rate = matchModelRate("opencode", "anthropic/claude-sonnet-5");
		expect(rate.approximate).toBe(false);
		expect(rate.inputPerM).toBe(3);
		expect(rate.outputPerM).toBe(15);
	});

	test("unknown models fall back to the cheapest rate, marked approximate", () => {
		const rate = matchModelRate("fx", "zai/glm-5.2");
		expect(rate.approximate).toBe(true);
	});

	test("plain ids still match their agent table", () => {
		const rate = matchModelRate("grok", "grok-4.6");
		expect(rate.approximate).toBe(false);
		expect(rate.inputPerM).toBe(2);
	});

	test("uses Gemini Pro long-context tiers above 200k prompt tokens", () => {
		expect(matchModelRate("agy", "gemini-3.1-pro", 200_000)).toMatchObject({
			inputPerM: 2,
			outputPerM: 12,
		});
		expect(matchModelRate("agy", "gemini-3.1-pro", 200_001)).toMatchObject({
			inputPerM: 4,
			outputPerM: 18,
		});
		expect(matchModelRate("agy", "gemini-2.5-pro", 200_001)).toMatchObject({
			inputPerM: 2.5,
			outputPerM: 15,
		});
	});
});
