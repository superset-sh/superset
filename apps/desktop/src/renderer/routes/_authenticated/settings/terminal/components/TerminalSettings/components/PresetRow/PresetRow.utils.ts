import type { V2ExecutionMode } from "@superset/local-db/schema/zod";

export function getPresetModeLabel(
	modeValue: V2ExecutionMode,
	commandCount: number,
): string {
	const hasMultipleCommands = commandCount > 1;

	if (modeValue === "background") {
		return "Background";
	}

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

/**
 * Maps a stored execution mode onto the launch-mode control's value. Single
 * command presets collapse the tab-shape variants into "split-pane" vs
 * "new-tab"; "background" is its own control value in both layouts.
 */
export function getLaunchModeValue(
	mode: V2ExecutionMode,
	hasMultipleCommands: boolean,
): V2ExecutionMode {
	if (hasMultipleCommands || mode === "background") return mode;
	return mode === "split-pane" || mode === "sequential"
		? "split-pane"
		: "new-tab";
}
