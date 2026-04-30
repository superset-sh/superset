import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Create a workspace on a host",
	options: {
		host: string().desc("Target host machineId (defaults to this machine)"),
		project: string().required().desc("Project ID"),
		name: string().required().desc("Workspace name"),
		branch: string().required().desc("Git branch"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const target = resolveHostTarget({
			requestedHostId: options.host ?? undefined,
			organizationId,
			userJwt: ctx.bearer,
		});

		const workspace = await target.client.workspace.create.mutate({
			projectId: options.project,
			name: options.name,
			branch: options.branch,
		});

		return {
			data: workspace,
			message: `Created workspace "${options.name}" on host ${target.hostId}`,
		};
	},
});
