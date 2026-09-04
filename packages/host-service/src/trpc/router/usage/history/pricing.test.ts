import { describe, expect, test } from "bun:test";
import { cacheSavingsUsd, costUsd, matchModelRate } from "./pricing";

describe("matchModelRate", () => {
	test("matches vendor-qualified ids from multi-model harnesses", () => {
		const rate = matchModelRate("opencode", "anthropic/claude-sonnet-5");
		expect(rate.approximate).toBe(false);
		expect(rate.inputPerM).toBe(2);
		expect(rate.outputPerM).toBe(10);
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

	test("prices GPT-6 Astra for codex and vendor-qualified harness ids", () => {
		expect(matchModelRate("codex", "gpt-6-astra")).toMatchObject({
			inputPerM: 10,
			outputPerM: 50,
			approximate: false,
		});
		expect(matchModelRate("omp", "openai-codex/gpt-6-astra")).toMatchObject({
			inputPerM: 10,
			outputPerM: 50,
			approximate: false,
		});
	});

	test("prices Fable 5.1 and Mythos 5.1 cache reads at their own rate, not the usual 0.1x", () => {
		const fable51 = matchModelRate("claude", "claude-fable-5-1");
		const fable5 = matchModelRate("claude", "claude-fable-5");
		expect(fable51).toMatchObject({
			inputPerM: 10,
			outputPerM: 50,
			cacheReadPerM: 0.25,
			approximate: false,
		});
		expect(matchModelRate("claude", "claude-mythos-5-1")).toMatchObject({
			cacheReadPerM: 0.25,
			approximate: false,
		});
		expect(matchModelRate("omp", "anthropic/claude-fable-5-1")).toMatchObject({
			cacheReadPerM: 0.25,
			approximate: false,
		});
		const cachedMillion = {
			uncachedInput: 0,
			cachedInput: 1_000_000,
			cacheWrite5m: 0,
			cacheWrite1h: 0,
			output: 0,
		};
		expect(costUsd(fable51, cachedMillion)).toBeCloseTo(0.25);
		expect(costUsd(fable5, cachedMillion)).toBeCloseTo(1);
		expect(
			costUsd(matchModelRate("claude", "claude-mythos-5"), cachedMillion),
		).toBeCloseTo(1);
		expect(cacheSavingsUsd(fable51, cachedMillion)).toBeCloseTo(9.75);
		expect(cacheSavingsUsd(fable5, cachedMillion)).toBeCloseTo(9);
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
