import type { TerminalPreset } from "@superset/local-db";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

/** The subset of a v2 row the CLI owns; the collection's update draft is typed looser than the row. */
type CliEditableFields = Partial<
	Pick<
		V2TerminalPresetRow,
		| "name"
		| "description"
		| "cwd"
		| "commands"
		| "projectIds"
		| "pinnedToBar"
		| "useAsWorkspaceRun"
		| "executionMode"
	>
>;

/**
 * Apply the fields the CLI can set onto an existing v2 row. Bar position,
 * creation time, and any agent link stay as the app has them.
 */
export function applyCliTerminalScriptEdit(
	draft: CliEditableFields,
	script: TerminalPreset,
): void {
	draft.name = script.name;
	draft.description = script.description;
	draft.cwd = script.cwd;
	draft.commands = script.commands;
	draft.projectIds = script.projectIds ?? null;
	draft.pinnedToBar = script.pinnedToBar;
	draft.useAsWorkspaceRun = script.useAsWorkspaceRun;
	draft.executionMode = script.executionMode ?? "new-tab";
}
