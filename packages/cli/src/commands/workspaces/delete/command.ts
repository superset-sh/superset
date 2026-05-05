import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Delete workspaces by ID",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Skip the cloud lookup and target this host directly"),
		local: boolean().desc("Skip the cloud lookup and target this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const explicitHostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const deleted: string[] = [];
		for (const id of ids) {
			let hostId = explicitHostId;
			if (!hostId) {
				const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
					organizationId,
					id,
				});
				if (!cloudWorkspace) {
					throw new CLIError(`Workspace not found: ${id}`);
				}
				hostId = cloudWorkspace.hostId;
			}

			const target = resolveHostTarget({
				requestedHostId: hostId,
				organizationId,
				userJwt: ctx.bearer,
			});

			await target.client.workspace.delete.mutate({ id });
			deleted.push(id);
		}

		return {
			data: { deleted },
			message:
				deleted.length === 1
					? `Deleted workspace ${deleted[0]}`
					: `Deleted ${deleted.length} workspaces`,
		};
	},
});
