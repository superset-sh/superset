import { boolean, CLIError, string } from "@superset/cli-framework";
import { EXECUTION_MODES } from "@superset/local-db";
import { command } from "../../../lib/command";
import { readConfig, resolveOrganizationId } from "../../../lib/config";
import { notifyDesktopSettingsChanged } from "../../../lib/settings/notify";
import { createTerminalScript } from "../../../lib/terminal-scripts";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
	},
	skipMiddleware: true,
	run: async ({ options }) => {
		const organizationId = resolveOrganizationId(readConfig());
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const invalidProjectId = options.project?.find(
			(projectId) => !UUID_PATTERN.test(projectId),
		);
		if (invalidProjectId) {
			throw new CLIError(
				`Invalid project UUID: ${invalidProjectId}`,
				"Pass the project UUID shown by `superset projects list`.",
			);
		}

		const script = createTerminalScript({
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
		const {
			cliImportPending: _,
			cliTargetOrganizationId: __,
			...publicScript
		} = script;

		const workspaceRunNote = options.workspaceRun
			? " Run precedence is: matching project script, project lifecycle Run command, then global script; the first matching script wins."
			: "";

		return {
			data: publicScript,
			message: `Added terminal script ${script.name} (${script.id}). ${
				refreshed
					? "The running desktop app refreshed immediately."
					: "It will import when the desktop app opens or refocuses with this organization active."
			}${workspaceRunNote}`,
		};
	},
});
