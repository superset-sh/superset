import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../../lib/command";
import {
	resolveProjectId,
	resolveSection,
} from "../../../../lib/host-sections";
import {
	resolveHostFilter,
	resolveHostTarget,
} from "../../../../lib/host-target";

export default command({
	description: "Delete a workspace group (its workspaces are ungrouped)",
	args: [positional("group").required().desc("Group name or id")],
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine (the default)"),
		project: string().desc(
			"Scope group-name resolution to a project (name or id)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId =
			resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}) ?? getHostId();
		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const projectId = options.project
			? await resolveProjectId(target.client, options.project)
			: undefined;
		const section = await resolveSection(
			target.client,
			args.group as string,
			projectId,
		);

		await target.client.sections.delete.mutate({ id: section.id });

		return {
			data: { id: section.id },
			message: `Deleted group "${section.name}" — its workspaces were ungrouped, not deleted`,
		};
	},
});
