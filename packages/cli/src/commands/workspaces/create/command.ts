import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Create a workspace on a host",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().required().desc("Project ID"),
		name: string().required().desc("Workspace name"),
		branch: string().desc("Git branch (required unless --pr is set)"),
		pr: number().desc("PR number — derives branch via gh pr checkout"),
		baseBranch: string().desc(
			"Branch to fork from when `branch` does not exist (defaults to project default)",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (Boolean(options.branch) === Boolean(options.pr)) {
			throw new CLIError(
				"Specify exactly one of --branch or --pr",
				"Use --branch <name> or --pr <number>",
			);
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const result = await target.client.workspaces.create.mutate({
			projectId: options.project,
			name: options.name,
			branch: options.branch,
			pr: options.pr,
			baseBranch: options.baseBranch,
		});

		return {
			data: result,
			message: result.alreadyExists
				? `Reused existing workspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
