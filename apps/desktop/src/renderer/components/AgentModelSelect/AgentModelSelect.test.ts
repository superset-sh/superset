import { describe, expect, test } from "bun:test";
import { resolveAgentModelSelectValue } from "./AgentModelSelect";
import { sortAgentModelOptions } from "./sortAgentModelOptions";

const models = [
	{ id: "model-a", label: "Model A" },
	{ id: "model-b", label: "Model B" },
];

describe("resolveAgentModelSelectValue", () => {
	test("uses a valid explicit selection", () => {
		expect(resolveAgentModelSelectValue(models, "model-b", false)).toBe(
			"model-b",
		);
	});

	test("falls back to the first model when the synthetic default is omitted", () => {
		expect(resolveAgentModelSelectValue(models, null, false)).toBe("model-a");
	});

	test("uses the synthetic default only when requested", () => {
		expect(resolveAgentModelSelectValue(models, null, true)).toBe(
			"__default_model__",
		);
	});
});

describe("sortAgentModelOptions", () => {
	test("sorts model versions newest-first and known tiers consistently", () => {
		const unsortedModels = [
			{ id: "auto", label: "Auto" },
			{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
			{ id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
			{ id: "gpt-oss-120b", label: "GPT OSS 120B" },
			{ id: "gpt-5.5", label: "GPT-5.5" },
			{ id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
			{ id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
			{ id: "gpt-5.4", label: "GPT-5.4" },
		];

		expect(
			sortAgentModelOptions(unsortedModels).map((model) => model.id),
		).toEqual([
			"auto",
			"gpt-5.6-sol",
			"gpt-5.6-terra",
			"gpt-5.6-luna",
			"gpt-5.5",
			"gpt-5.4",
			"gpt-5.4-mini",
			"gpt-oss-120b",
		]);
	});

	test("applies tier ordering to other model families", () => {
		const unsortedModels = [
			{ id: "claude-sonnet-5", label: "Claude Sonnet 5" },
			{ id: "claude-opus-4-8", label: "Claude Opus 4.8" },
			{ id: "claude-fable-5", label: "Claude Fable 5" },
			{ id: "claude-opus-5", label: "Claude Opus 5" },
		];

		expect(
			sortAgentModelOptions(unsortedModels).map((model) => model.id),
		).toEqual([
			"claude-opus-5",
			"claude-fable-5",
			"claude-sonnet-5",
			"claude-opus-4-8",
		]);
	});

	test("preserves family order instead of comparing vendor version numbers", () => {
		const unsortedModels = [
			{ id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
			{ id: "gpt-5.4", label: "GPT-5.4" },
			{ id: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
			{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
		];

		expect(
			sortAgentModelOptions(unsortedModels).map((model) => model.id),
		).toEqual([
			"claude-sonnet-4.6",
			"claude-haiku-4.5",
			"gpt-5.4",
			"gpt-5.3-codex",
		]);
	});

	test("preserves runtime order when models have no semantic distinction", () => {
		const unsortedModels = [
			{ id: "custom-beta", label: "Custom Beta" },
			{ id: "custom-alpha", label: "Custom Alpha" },
		];

		expect(sortAgentModelOptions(unsortedModels)).toEqual(unsortedModels);
	});
});
