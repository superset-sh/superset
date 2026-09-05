import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { EXECUTION_MODES } from "@superset/local-db";
import { command } from "../../../lib/command";
import { notifyDesktopSettingsChanged } from "../../../lib/settings/notify";
import {
	type TerminalScriptPatch,
	toPublicTerminalScript,
	updateTerminalScript,
} from "../../../lib/terminal-scripts";
import {
	assertProjectIds,
	desktopSyncNote,
	requireOrganizationId,
} from "../shared";

export default command({
	description: "Edit a terminal script in place",
	args: [positional("id").required().desc("Script id from `scripts list`")],
	options: {
		name: string().desc("New display name"),
		command: string()
			.variadic()
			.desc("Replace the commands; repeat to launch multiple commands"),
		description: string().desc("New description (empty string clears it)"),
		cwd: string().desc("Working directory relative to the workspace"),
		project: string()
			.variadic()
			.desc("Replace the project list with these UUIDs; repeatable"),
		allProjects: boolean().desc("Make the script available in every project"),
		executionMode: string()
			.enum(...EXECUTION_MODES)
			.desc("How multiple commands open"),
		hidden: boolean().desc(
			"Hide from the Scripts bar (--no-hidden shows it again)",
		),
		workspaceRun: boolean().desc(
			"Use as the project's Run action (--no-workspace-run stops)",
		),
	},
	skipMiddleware: true,
	run: async ({ args, options }) => {
		const organizationId = requireOrganizationId();
		const id = args.id as string;
		if (options.project?.length && options.allProjects) {
			throw new CLIError(
				"Cannot combine --project and --all-projects",
				"Pass one or the other",
			);
		}
		assertProjectIds(options.project);

		const patch: TerminalScriptPatch = {
			name: options.name,
			commands: options.command,
			description: options.description,
			cwd: options.cwd,
			projectIds: options.allProjects
				? null
				: options.project?.length
					? options.project
					: undefined,
			executionMode: options.executionMode,
			pinnedToBar: options.hidden === undefined ? undefined : !options.hidden,
			useAsWorkspaceRun: options.workspaceRun,
		};
		if (Object.values(patch).every((value) => value === undefined)) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --command, --description, --cwd, --project, --all-projects, --execution-mode, --hidden, or --workspace-run",
			);
		}

		const script = updateTerminalScript({ organizationId, id, patch });
		const refreshed = await notifyDesktopSettingsChanged();

		return {
			data: toPublicTerminalScript(script),
			message: `Updated terminal script ${script.name} (${script.id}). ${desktopSyncNote(refreshed)}`,
		};
	},
});
