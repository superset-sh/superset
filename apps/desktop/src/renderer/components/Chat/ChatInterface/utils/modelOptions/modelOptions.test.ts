import { describe, expect, it } from "bun:test";
import type { ModelOption } from "../../types";
import {
	filterModelGroupsBySearch,
	filterModelSelectorItem,
	findModelByQuery,
	groupModelsByModelFamily,
	inferModelFamily,
	type ModelCatalogOption,
	normalizeModelSearchText,
} from "./modelOptions";

const models: ModelOption[] = [
	{ id: "provider-a/gpt-5.4", name: "gpt-5.4", provider: "Gateway A" },
	{ id: "provider-a/gpt-5.5", name: "gpt-5.5", provider: "Gateway A" },
	{
		id: "provider-a/gpt-5.5(xhigh)",
		name: "gpt-5.5(xhigh)",
		provider: "Gateway A",
	},
	{
		id: "provider-b/claude-sonnet-4-5",
		name: "Claude Sonnet 4.5",
		provider: "Gateway B",
	},
];

describe("normalizeModelSearchText", () => {
	it("makes punctuation-insensitive search keys", () => {
		expect(normalizeModelSearchText("GPT-5.5 (xhigh)")).toBe("gpt55xhigh");
	});
});

describe("filterModelSelectorItem", () => {
	it("matches compact queries against punctuated model ids", () => {
		expect(
			filterModelSelectorItem("provider-a/gpt-5.5", "gpt5.5", [
				"gpt-5.5",
				"Gateway A",
			]),
		).toBeGreaterThan(0);
	});

	it("matches the common got/gpt typo used while searching GPT models", () => {
		expect(
			filterModelSelectorItem("provider-a/gpt-5.5", "got-5.5", [
				"gpt-5.5",
				"Gateway A",
			]),
		).toBeGreaterThan(0);
	});
});

describe("inferModelFamily", () => {
	it("keeps GPT and Codex models in the OpenAI family", () => {
		expect(
			inferModelFamily({
				id: "provider-a/codex-mini",
				name: "codex-mini",
				provider: "Gateway A",
			}),
		).toBe("OpenAI");
		expect(inferModelFamily(models[0] as ModelOption)).toBe("OpenAI");
	});

	it("recognizes GLM models from model ids", () => {
		expect(
			inferModelFamily({
				id: "provider-a/glm-4.6",
				name: "glm-4.6",
				provider: "Gateway A",
			}),
		).toBe("GLM");
	});

	it("does not let provider protocol override a recognizable model family", () => {
		const anthropicCompatibleGlmModel: ModelCatalogOption = {
			id: "anthropic/superset:encoded-provider-ref",
			modelId: "glm-5.1",
			name: "glm-5.1",
			protocol: "anthropic",
			provider: "Anthropic-compatible Gateway",
		};

		expect(inferModelFamily(anthropicCompatibleGlmModel)).toBe("GLM");
	});
});

describe("groupModelsByModelFamily", () => {
	it("groups by model family and sorts newer model versions first", () => {
		const grouped = groupModelsByModelFamily(models);
		expect(grouped[0]?.[0]).toBe("OpenAI");
		expect(grouped[0]?.[1].map((model) => model.name)).toEqual([
			"gpt-5.5(xhigh)",
			"gpt-5.5",
			"gpt-5.4",
		]);
		expect(grouped[1]?.[0]).toBe("Anthropic");
	});

	it("does not sort parameter sizes like 120b above model versions", () => {
		const grouped = groupModelsByModelFamily([
			{
				id: "provider-a/gpt-oss-120b-medium",
				name: "gpt-oss-120b-medium",
				provider: "Gateway A",
			},
			{ id: "provider-a/gpt-5.4", name: "gpt-5.4", provider: "Gateway A" },
			{
				id: "provider-a/gpt-5.5-ziyan",
				name: "gpt-5.5-ziyan",
				provider: "Gateway A",
			},
			{ id: "provider-a/gpt-5.5", name: "gpt-5.5", provider: "Gateway A" },
			{
				id: "provider-a/model-v2.5",
				name: "model-v2.5",
				provider: "Gateway A",
			},
		]);

		const openAiGroup = grouped.find(([family]) => family === "OpenAI");

		expect(openAiGroup?.[1].map((model) => model.name)).toEqual([
			"gpt-5.5",
			"gpt-5.5-ziyan",
			"gpt-5.4",
			"gpt-oss-120b-medium",
		]);
	});

	it("filters grouped models with the same typo-tolerant search logic", () => {
		const grouped = groupModelsByModelFamily(models);
		const filtered = filterModelGroupsBySearch(grouped, "got-5.5");

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.[0]).toBe("OpenAI");
		expect(filtered[0]?.[1].map((model) => model.name)).toEqual([
			"gpt-5.5",
			"gpt-5.5(xhigh)",
		]);
	});

	it("keeps numeric version search scoped to visible model ids", () => {
		const versionSearchModels: ModelCatalogOption[] = [
			...models,
			{
				id: "anthropic/superset:54-internal-routing-ref",
				modelId: "glm-4.6",
				name: "glm-4.6",
				provider: "Relay 54",
				providerId: "provider-54",
			} satisfies ModelCatalogOption,
			{
				id: "provider-54/deepseek-chat",
				modelId: "deepseek-chat",
				name: "deepseek-chat",
				provider: "Gateway 54",
				providerId: "provider-54",
			} satisfies ModelCatalogOption,
		];
		const grouped = groupModelsByModelFamily(versionSearchModels);
		const filtered = filterModelGroupsBySearch(grouped, "5.4");

		expect(
			filtered.flatMap(([, groupModels]) =>
				groupModels.map((model) => model.name),
			),
		).toEqual(["gpt-5.4"]);
	});
});

describe("findModelByQuery", () => {
	it("uses the same punctuation-insensitive matching as the picker", () => {
		expect(findModelByQuery(models, "gpt5.5")?.id).toBe("provider-a/gpt-5.5");
		expect(findModelByQuery(models, "got-5.5")?.id).toBe("provider-a/gpt-5.5");
	});
});
