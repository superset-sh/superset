import type { ExecutionMode } from "@superset/local-db/schema/zod";

export function getPresetModeLabel(
	modeValue: ExecutionMode,
	commandCount: number,
): string {
	const hasMultipleCommands = commandCount > 1;

	if (modeValue === "new-tab") {
		return hasMultipleCommands ? "Tab per command" : "New tab";
	}

	if (modeValue === "new-tab-split-pane") {
		return hasMultipleCommands ? "New tab + panes" : "New tab";
	}

	if (modeValue === "sequential") {
		return hasMultipleCommands ? "All in current tab" : "Current tab";
	}

	return hasMultipleCommands ? "Single tab + panes" : "Split pane";
}
