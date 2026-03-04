import type { StartableAgentType } from "@superset/shared/agent-launch";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getFallbackStartableAgent,
	getSelectableStartableAgents,
} from "shared/utils/agent-preset-settings";

function useUpdateAgentPreset(
	options?: Parameters<
		typeof electronTrpc.settings.updateAgentPreset.useMutation
	>[0],
) {
	const utils = electronTrpc.useUtils();

	return electronTrpc.settings.updateAgentPreset.useMutation({
		...options,
		onSuccess: async (...args) => {
			await utils.settings.getAgentPresets.invalidate();
			await options?.onSuccess?.(...args);
		},
	});
}

export function useAgentPresets() {
	const { data: presets = [], isLoading } =
		electronTrpc.settings.getAgentPresets.useQuery();

	const updatePreset = useUpdateAgentPreset();

	return {
		presets,
		isLoading,
		updatePreset,
	};
}

export function useAgentLaunchAgents() {
	const { data: presets = [], isLoading } =
		electronTrpc.settings.getAgentPresets.useQuery();

	const selectableAgents = useMemo(
		() => getSelectableStartableAgents(presets),
		[presets],
	);
	const selectableAgentSet = useMemo(
		() => new Set(selectableAgents),
		[selectableAgents],
	);
	const fallbackAgent = useMemo(
		() => getFallbackStartableAgent(selectableAgents),
		[selectableAgents],
	);
	const agentPresetById = useMemo(
		() => new Map(presets.map((preset) => [preset.id, preset] as const)),
		[presets],
	);
	const agentLabels = useMemo(() => {
		const labels: Partial<Record<StartableAgentType, string>> = {
			"superset-chat": "Superset Chat",
		};
		for (const preset of presets) {
			labels[preset.id as StartableAgentType] = preset.label;
		}
		return labels;
	}, [presets]);

	return {
		presets,
		isLoading,
		selectableAgents,
		selectableAgentSet,
		fallbackAgent,
		agentPresetById,
		agentLabels,
	};
}
