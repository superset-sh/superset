import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { promoteWorkspace } from "../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Save a ready cloud workspace as a new environment that new workspaces fork from; restarts the workspace",
	options: {
		workspace: string().required().desc("Cloud workspace ID"),
		name: string().required().desc("Name for the new environment"),
		scope: string()
			.enum("organization", "personal")
			.desc("Who can use it (default: same as the workspace's environment)"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const saved = await promoteWorkspace({
			api: ctx.api,
			organizationId,
			workspaceId: options.workspace,
			into: { name: options.name },
			scope: options.scope,
		});
		return {
			data: saved,
			message: `Saved ${saved.name} (${saved.id}, ${saved.scope}); new workspaces on it fork from ${saved.sourceRef}`,
		};
	},
});
