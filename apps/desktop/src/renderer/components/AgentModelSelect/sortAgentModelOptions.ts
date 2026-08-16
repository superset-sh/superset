import type { AgentModelOption } from "@superset/shared/agent-models";

const MODEL_TIER_ORDER = new Map([
	["sol", 0],
	["terra", 1],
	["luna", 2],
	["opus", 0],
	["fable", 1],
	["sonnet", 2],
	["haiku", 3],
	["pro", 0],
	["flash", 1],
	["mini", 10],
	["nano", 11],
]);

const FAMILY_TIER_TOKENS = new Set([
	"sol",
	"terra",
	"luna",
	"opus",
	"fable",
	"sonnet",
	"haiku",
	"pro",
	"flash",
	"mini",
	"nano",
]);

function normalizedModelId(model: AgentModelOption): string {
	return (model.id.split("/").at(-1) ?? model.id).toLowerCase();
}

function getModelFamily(model: AgentModelOption): string {
	const id = normalizedModelId(model);
	const prefix = id.match(/^[^0-9]+/)?.[0] ?? id;
	const tokens = prefix
		.split(/[^a-z]+/)
		.filter(Boolean)
		.filter((token) => !FAMILY_TIER_TOKENS.has(token));
	return tokens.join("-") || id;
}

function getModelVersion(model: AgentModelOption): number[] {
	const version = normalizedModelId(model).match(/\d+(?:[.-]\d+)*/)?.[0];
	return version?.split(/[.-]/).map(Number) ?? [];
}

function compareVersions(left: number[], right: number[]): number {
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const difference = (right[index] ?? 0) - (left[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

function getModelTier(model: AgentModelOption): number {
	const tokens = `${model.id} ${model.label}`.toLowerCase().split(/[^a-z]+/);
	for (const token of tokens) {
		const rank = MODEL_TIER_ORDER.get(token);
		if (rank !== undefined) return rank;
	}
	return 5;
}

function sortModelFamily(models: AgentModelOption[]): AgentModelOption[] {
	return models
		.map((model, index) => ({ model, index }))
		.sort((left, right) => {
			const versionOrder = compareVersions(
				getModelVersion(left.model),
				getModelVersion(right.model),
			);
			if (versionOrder !== 0) return versionOrder;

			const tierOrder = getModelTier(left.model) - getModelTier(right.model);
			return tierOrder !== 0 ? tierOrder : left.index - right.index;
		})
		.map(({ model }) => model);
}

export function sortAgentModelOptions(
	models: AgentModelOption[],
): AgentModelOption[] {
	return Array.from(Map.groupBy(models, getModelFamily).values()).flatMap(
		sortModelFamily,
	);
}
