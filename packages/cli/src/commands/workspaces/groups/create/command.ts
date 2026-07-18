import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveProjectId } from "../../../../lib/host-sections";
import {
	requireHostTarget,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "Create a workspace group on a host",
	args: [positional("name").required().desc("Group name")],
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string()
			.required()
			.desc("Project name (case-insensitive) or id the group belongs to"),
		color: string().desc("Group color (hex), shown in the desktop sidebar"),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
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

		const projectId = await resolveProjectId(
			ctx,
			organizationId,
			options.project,
		);

		const section = await target.client.sections.create.mutate({
			projectId,
			name: args.name as string,
			color: options.color ?? undefined,
		});

		return {
			data: section,
			message: `Created group "${section.name}" on host ${target.hostId}`,
		};
	},
});
