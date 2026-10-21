import type { SessionConfigOption } from "@superset/chat/protocol";
import type {
	AgentEffortOption,
	AgentModelSupport,
	AgentModeSupport,
} from "@superset/shared/agent-models";

/** Picking this option launches with the agent's own default. */
export const AGENT_DEFAULT_OPTION_ID = "__agent_default__";
export const LAUNCH_MODEL_OPTION_ID = "model";
export const LAUNCH_EFFORT_OPTION_ID = "effort";
export const LAUNCH_MODE_OPTION_ID = "mode";

export type LaunchConfigLabels = {
	model: string;
	defaultModel: string;
	effort: string;
	defaultEffort: string;
	mode: string;
	directMode: string;
};

type Entry = { id: string; label: string };

function withDefault(
	defaultLabel: string,
	entries: readonly Entry[],
	selected: string | null,
): Pick<SessionConfigOption, "currentValue" | "options"> {
	const options = [
		{ id: AGENT_DEFAULT_OPTION_ID, label: defaultLabel },
		...entries.map(({ id, label }) => ({ id, label })),
	];
	return {
		currentValue: entries.some((entry) => entry.id === selected)
			? (selected as string)
			: AGENT_DEFAULT_OPTION_ID,
		options,
	};
}

/**
 * The static agent catalog in the shape the chat's ModelPicker reads from a
 * live session, so the New Workspace screen renders the same picker.
 */
export function launchConfigOptions(input: {
	modelSupport: AgentModelSupport | undefined;
	selectedModel: string | null;
	efforts: readonly AgentEffortOption[];
	selectedEffort: string | null;
	modeSupport: AgentModeSupport | undefined;
	selectedMode: string | null;
	labels: LaunchConfigLabels;
}): SessionConfigOption[] {
	const { labels } = input;
	const options: SessionConfigOption[] = [];
	if (input.modelSupport) {
		options.push({
			id: LAUNCH_MODEL_OPTION_ID,
			label: labels.model,
			category: "model",
			...withDefault(
				labels.defaultModel,
				input.modelSupport.models,
				input.selectedModel,
			),
		});
	}
	if (input.efforts.length > 0) {
		options.push({
			id: LAUNCH_EFFORT_OPTION_ID,
			label: labels.effort,
			category: "thought_level",
			...withDefault(labels.defaultEffort, input.efforts, input.selectedEffort),
		});
	}
	if (input.modeSupport) {
		options.push({
			id: LAUNCH_MODE_OPTION_ID,
			label: labels.mode,
			category: "launch_mode",
			...withDefault(
				labels.directMode,
				input.modeSupport.modes,
				input.selectedMode,
			),
		});
	}
	return options;
}

/** The catalog id a picked option value stands for; the default is `null`. */
export function launchOptionValue(value: string): string | null {
	return value === AGENT_DEFAULT_OPTION_ID ? null : value;
}
