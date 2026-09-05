import { boolean, string } from "@superset/cli-framework";
import { EXECUTION_MODES } from "@superset/local-db";
import { command } from "../../../lib/command";
import { notifyDesktopSettingsChanged } from "../../../lib/settings/notify";
import {
	createTerminalScript,
	findTerminalScriptByName,
	toPublicTerminalScript,
	updateTerminalScript,
} from "../../../lib/terminal-scripts";
import {
	assertProjectIds,
	desktopSyncNote,
	requireOrganizationId,
} from "../shared";

export default command({
	description: "Add a reusable terminal script",
	options: {
		name: string().required().desc("Display name"),
		command: string()
			.required()
			.variadic()
			.desc("Shell command; repeat to launch multiple commands"),
		description: string().desc("Optional description"),
		cwd: string().desc("Working directory relative to the workspace"),
		project: string()
			.variadic()
			.desc("Limit to a project UUID; repeat for multiple projects"),
		executionMode: string()
			.enum(...EXECUTION_MODES)
			.desc("How multiple commands open"),
		hidden: boolean().desc("Create without showing it in the Scripts bar"),
		workspaceRun: boolean().desc("Use as the project's Run action"),
		upsert: boolean().desc(
			"Replace the script with this name instead of adding a duplicate",
		),
	},
	skipMiddleware: true,
	run: async ({ options }) => {
		const organizationId = requireOrganizationId();
		assertProjectIds(options.project);

		const existing = options.upsert
			? findTerminalScriptByName(options.name)
			: undefined;
		const script = existing
			? updateTerminalScript({
					organizationId,
					id: existing.id,
					patch: {
						name: options.name,
						description: options.description ?? "",
						cwd: options.cwd ?? "",
						commands: options.command,
						projectIds: options.project ?? null,
						pinnedToBar: !options.hidden,
						useAsWorkspaceRun: options.workspaceRun ?? false,
						executionMode: options.executionMode ?? "new-tab",
					},
				})
			: createTerminalScript({
					organizationId,
					name: options.name,
					description: options.description,
					cwd: options.cwd,
					commands: options.command,
					projectIds: options.project,
					pinnedToBar: !options.hidden,
					useAsWorkspaceRun: options.workspaceRun,
					executionMode: options.executionMode ?? "new-tab",
				});
		const refreshed = await notifyDesktopSettingsChanged();

		const workspaceRunNote = options.workspaceRun
			? " Run precedence is: matching project script, project lifecycle Run command, then global script; the first matching script wins."
			: "";

		return {
			data: toPublicTerminalScript(script),
			message: `${existing ? "Updated" : "Added"} terminal script ${script.name} (${script.id}). ${desktopSyncNote(refreshed)}${workspaceRunNote}`,
		};
	},
});
