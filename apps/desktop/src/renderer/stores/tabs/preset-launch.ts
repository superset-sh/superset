import type { ExecutionMode } from "@superset/local-db";

export type PresetOpenTarget = "new-tab" | "active-tab";
export type PresetMode = ExecutionMode;

export type PresetLaunchPlan =
	| "new-tab-single"
	| "new-tab-multi-pane"
	| "new-tab-per-command"
	| "active-tab-single"
	| "active-tab-multi-pane";

export function getPresetLaunchPlan({
	mode,
	target,
	commandCount,
	hasActiveTab,
}: {
	mode: PresetMode;
	target: PresetOpenTarget;
	commandCount: number;
	hasActiveTab: boolean;
}): PresetLaunchPlan {
	const hasMultipleCommands = commandCount > 1;
	const shouldUseActiveTab =
		target === "active-tab" && mode === "split-pane" && hasActiveTab;

	if (shouldUseActiveTab) {
		return hasMultipleCommands ? "active-tab-multi-pane" : "active-tab-single";
	}

	if (mode === "new-tab" && hasMultipleCommands) {
		return "new-tab-per-command";
	}

	return hasMultipleCommands ? "new-tab-multi-pane" : "new-tab-single";
}
