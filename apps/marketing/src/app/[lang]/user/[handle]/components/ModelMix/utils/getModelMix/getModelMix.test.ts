import { describe, expect, test } from "bun:test";
import { getModelMix } from "./getModelMix";

describe("listed model mix", () => {
	test("uses only listed usage and groups actual other models", () => {
		expect(
			getModelMix([
				{ model: "claude-opus", tokens: "60" },
				{ model: "claude-sonnet", tokens: "20" },
				{ model: "gpt-5", tokens: "15" },
				{ model: "gemini", tokens: "5" },
			]),
		).toEqual({ claude: 80, gpt: 15, other: 5, total: 100 });
	});
	test("does not invent other usage when the list is truncated", () => {
		expect(
			getModelMix([
				{ model: "claude-opus", tokens: "80" },
				{ model: "gpt-5", tokens: "20" },
			]),
		).toEqual({ claude: 80, gpt: 20, other: 0, total: 100 });
	});
	test("handles empty, zero and invalid counts", () => {
		expect(getModelMix([]).total).toBe(0);
		expect(
			getModelMix([
				{ model: "claude-opus", tokens: "0" },
				{ model: "gpt-5", tokens: "NaN" },
				{ model: "other", tokens: "-1" },
			]).total,
		).toBe(0);
	});
});
