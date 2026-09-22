import {
	type AgentEffortOption,
	type AgentModelOption,
	getAgentEfforts,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { useMemo } from "react";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

export interface AgentLaunchPreferences {
	/** Curated models the preset offers; undefined when it has no model flag. */
	models: AgentModelOption[] | undefined;
	/** Efforts the preset offers next to `model`; empty when it has none. */
	efforts: AgentEffortOption[];
	/** The remembered pick, or null for the agent's own default. */
	model: AgentModelOption | null;
	effort: AgentEffortOption | null;
}

const NO_PREFERENCES: AgentLaunchPreferences = {
	models: undefined,
	efforts: [],
	model: null,
	effort: null,
};

/**
 * The catalog key for an agent config: its preset, except that a config whose
 * executable is OMP launches with OMP's options — the same resolution the host
 * applies before validating a launch.
 */
export function agentLaunchPresetId(config: {
	presetId: string;
	command?: string;
}): string {
	return config.command
		? resolveAgentLaunchPresetId(config.presetId, config.command)
		: config.presetId;
}

/**
 * The remembered model and effort for a launch preset, checked against the
 * curated catalog. A pick that fell out of the catalog, or an effort the
 * picked model rejects, reads as the default: the host would refuse it, and
 * "Default" beats a launch that fails.
 */
export function resolveAgentLaunchPreferences(
	presetId: string | null,
	modelByAgent: Record<string, string>,
	effortByAgent: Record<string, string>,
): AgentLaunchPreferences {
	if (!presetId) return NO_PREFERENCES;
	const models = getAgentModelSupport(presetId)?.models;
	const model =
		models?.find((option) => option.id === modelByAgent[presetId]) ?? null;
	const efforts = getAgentEfforts(presetId, model?.id);
	const effort =
		efforts.find((option) => option.id === effortByAgent[presetId]) ?? null;
	return { models, efforts, model, effort };
}

/** "Opus · High" — what a launch adds to the agent's default; null for nothing. */
export function describeAgentLaunchPreferences({
	model,
	effort,
}: AgentLaunchPreferences): string | null {
	const parts = [model?.label, effort?.label].filter((label): label is string =>
		Boolean(label),
	);
	return parts.length > 0 ? parts.join(" · ") : null;
}

export function useAgentLaunchPreferences(
	presetId: string | null,
): AgentLaunchPreferences {
	const modelByAgent = useNewSessionPreferencesStore(
		(state) => state.modelByAgent,
	);
	const effortByAgent = useNewSessionPreferencesStore(
		(state) => state.effortByAgent,
	);
	return useMemo(
		() => resolveAgentLaunchPreferences(presetId, modelByAgent, effortByAgent),
		[presetId, modelByAgent, effortByAgent],
	);
}
