import type { ExecutionMode } from "@superset/local-db/schema/zod";

export type PresetOpenTarget = "new-tab" | "active-tab";
export type PresetMode = ExecutionMode;

export type PresetLaunchPlan =
	| "active-terminal"
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
	hasActiveTerminal,
}: {
	mode: PresetMode;
	target: PresetOpenTarget;
	commandCount: number;
	hasActiveTab: boolean;
	hasActiveTerminal?: boolean;
}): PresetLaunchPlan {
	const hasMultipleCommands = commandCount > 1;
	const shouldUseActiveTab =
		target === "active-tab" &&
		(mode === "split-pane" || mode === "sequential") &&
		hasActiveTab;

	if (mode === "sequential") {
		// Sequential grouped presets should never create split panes. Prefer the
		// focused terminal, then fall back to one new terminal tab.
		if (target === "active-tab" && hasActiveTerminal) {
			return "active-terminal";
		}
		return "new-tab-single";
	}

	if (shouldUseActiveTab) {
		return hasMultipleCommands ? "active-tab-multi-pane" : "active-tab-single";
	}

	if (mode === "new-tab" && hasMultipleCommands) {
		return "new-tab-per-command";
	}

	return hasMultipleCommands ? "new-tab-multi-pane" : "new-tab-single";
}
