import { describe, expect, test } from "bun:test";
import type {
	AgentModelSupport,
	AgentRuntimeModelVariant,
} from "@superset/shared/agent-models";
import {
	buildCursorLaunchSelection,
	buildCursorModelSupport,
	buildCursorVariantSupports,
	type CursorRuntimeModel,
	resolveCursorVariant,
} from "./cursorModelVariants";

const transport: AgentModelSupport = {
	presetId: "cursor-agent",
	modelFlag: "--model",
	models: [],
};

function runtimeModel(
	id: string,
	variant: Partial<AgentRuntimeModelVariant> = {},
	metadata: Partial<Pick<CursorRuntimeModel, "label" | "provider">> = {},
): CursorRuntimeModel {
	return {
		id,
		label: metadata.label ?? id,
		provider: metadata.provider ?? "OpenAI",
		variant: {
			familyId: "gpt-5.6-sol",
			familyLabel: "GPT-5.6 Sol",
			effort: "medium",
			speed: "standard",
			mode: "standard",
			contextWindow: "default",
			...variant,
		},
	};
}

const models: CursorRuntimeModel[] = [
	runtimeModel(
		"gpt-5.6-sol-medium",
		{ contextWindow: "1m" },
		{ label: "GPT-5.6 Sol 1M" },
	),
	runtimeModel(
		"gpt-5.6-sol-medium-fast",
		{ speed: "fast" },
		{ label: "GPT-5.6 Sol Fast" },
	),
	runtimeModel(
		"gpt-5.6-sol-high",
		{ effort: "high", contextWindow: "1m" },
		{ label: "GPT-5.6 Sol 1M High" },
	),
	runtimeModel(
		"composer-2.5",
		{
			familyId: "composer-2.5",
			familyLabel: "Composer 2.5",
			effort: "default",
		},
		{ label: "Composer 2.5", provider: "Cursor" },
	),
];

describe("Cursor model variants", () => {
	test("collapses exact ids into provider-grouped model families", () => {
		expect(buildCursorModelSupport(transport, models)).toMatchObject({
			defaultModelId: "gpt-5.6-sol",
			models: [
				{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "OpenAI" },
				{ id: "composer-2.5", label: "Composer 2.5", provider: "Cursor" },
			],
		});
		expect(
			buildCursorModelSupport(transport, models).modelAliases?.[
				"gpt-5.6-sol-medium-fast"
			],
		).toBe("gpt-5.6-sol");
	});

	test("derives only dimensions with multiple account-available choices", () => {
		const supports = buildCursorVariantSupports(models.slice(0, 3));
		expect(supports.effort?.efforts.map((option) => option.id)).toEqual([
			"medium",
			"high",
		]);
		expect(supports.speed?.speeds.map((option) => option.id)).toEqual([
			"standard",
			"fast",
		]);
		expect(
			supports.contextWindow?.contextWindows.map((option) => option.id),
		).toEqual(["default", "1m"]);
		expect(supports.mode).toBeUndefined();
	});

	test("prioritizes the changed dimension without inventing a combination", () => {
		expect(
			resolveCursorVariant(
				models.slice(0, 3),
				{
					effort: "medium",
					speed: "fast",
					contextWindow: "1m",
				},
				"speed",
			)?.id,
		).toBe("gpt-5.6-sol-medium-fast");
	});

	test("returns the exact runtime id and clears separately launched traits", () => {
		expect(
			buildCursorLaunchSelection(models.slice(0, 3), {
				effort: "medium",
				speed: "fast",
				mode: "standard",
				contextWindow: "default",
			}),
		).toEqual({
			launchModel: "gpt-5.6-sol-medium-fast",
			resolvedTraits: {
				effort: "medium",
				speed: "fast",
				mode: "standard",
				contextWindow: "default",
			},
			traitsForLaunch: {
				effort: null,
				speed: null,
				mode: null,
				contextWindow: null,
			},
		});
	});

	test("keeps an unsuffixed runtime id as an explicit default effort", () => {
		const defaultModels: CursorRuntimeModel[] = [
			runtimeModel(
				"gpt-5.2-low",
				{
					familyId: "gpt-5.2",
					familyLabel: "GPT-5.2",
					effort: "low",
				},
				{ label: "GPT-5.2 Low" },
			),
			runtimeModel(
				"gpt-5.2",
				{
					familyId: "gpt-5.2",
					familyLabel: "GPT-5.2",
					effort: "default",
				},
				{ label: "GPT-5.2" },
			),
			runtimeModel(
				"gpt-5.2-high",
				{
					familyId: "gpt-5.2",
					familyLabel: "GPT-5.2",
					effort: "high",
				},
				{ label: "GPT-5.2 High" },
			),
		];

		expect(buildCursorVariantSupports(defaultModels).effort).toMatchObject({
			defaultEffortId: "default",
			efforts: [
				{ id: "default", label: "Default" },
				{ id: "low", label: "Low" },
				{ id: "high", label: "High" },
			],
		});
		expect(
			resolveCursorVariant(
				defaultModels,
				{
					effort: "default",
					speed: "standard",
					mode: "standard",
					contextWindow: "default",
				},
				"effort",
			)?.id,
		).toBe("gpt-5.2");
	});

	test("selects a runtime default effort without treating it as absent", () => {
		const grokModels: CursorRuntimeModel[] = [
			runtimeModel(
				"cursor-grok-4.6-high-fast",
				{
					familyId: "cursor-grok-4.6",
					familyLabel: "Cursor Grok 4.6",
					effort: "high",
					speed: "fast",
				},
				{ label: "Cursor Grok 4.6 Fast" },
			),
			runtimeModel(
				"cursor-grok-4.6-low",
				{
					familyId: "cursor-grok-4.6",
					familyLabel: "Cursor Grok 4.6",
					effort: "low",
				},
				{ label: "Cursor Grok 4.6 Low" },
			),
			runtimeModel(
				"cursor-grok-4.6-high",
				{
					familyId: "cursor-grok-4.6",
					familyLabel: "Cursor Grok 4.6",
					effort: "high",
				},
				{ label: "Cursor Grok 4.6" },
			),
		];

		expect(buildCursorVariantSupports(grokModels).speed).toMatchObject({
			defaultSpeedId: "standard",
		});
		expect(
			resolveCursorVariant(
				grokModels,
				{
					effort: "high",
					speed: "standard",
					mode: "standard",
					contextWindow: "default",
				},
				"effort",
			)?.id,
		).toBe("cursor-grok-4.6-high");
	});
});
