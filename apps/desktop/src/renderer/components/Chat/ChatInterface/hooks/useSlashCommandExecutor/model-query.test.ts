import { describe, expect, it } from "bun:test";
import type { ModelOption } from "../../types";
import {
	findModelByQuery,
	normalizeModelQueryFromActionArgument,
} from "./model-query";

const modelOptions: ModelOption[] = [
	{
		id: "anthropic/claude-sonnet-4-5",
		name: "Claude Sonnet 4.5",
		provider: "anthropic",
	},
	{ id: "openai/gpt-4.1", name: "GPT-4.1", provider: "openai" },
	{ id: "gateway/gpt-5.5", name: "gpt-5.5", provider: "gateway" },
];

describe("normalizeModelQueryFromActionArgument", () => {
	it("dequotes double-quoted values", () => {
		expect(normalizeModelQueryFromActionArgument('"claude sonnet 4.5"')).toBe(
			"claude sonnet 4.5",
		);
	});

	it("dequotes single-quoted values", () => {
		expect(normalizeModelQueryFromActionArgument("'claude sonnet 4.5'")).toBe(
			"claude sonnet 4.5",
		);
	});

	it("preserves unquoted multi-token input", () => {
		expect(normalizeModelQueryFromActionArgument("claude sonnet 4.5")).toBe(
			"claude sonnet 4.5",
		);
	});

	it("returns empty string for empty or blank values", () => {
		expect(normalizeModelQueryFromActionArgument("")).toBe("");
		expect(normalizeModelQueryFromActionArgument("   ")).toBe("");
	});
});

describe("findModelByQuery", () => {
	it("finds a model by spaced name after dequoting", () => {
		const query = normalizeModelQueryFromActionArgument('"Claude Sonnet 4.5"');
		expect(findModelByQuery(modelOptions, query)?.id).toBe(
			"anthropic/claude-sonnet-4-5",
		);
	});

	it("finds GPT models with punctuation-insensitive search", () => {
		expect(findModelByQuery(modelOptions, "gpt5.5")?.id).toBe(
			"gateway/gpt-5.5",
		);
	});
});
