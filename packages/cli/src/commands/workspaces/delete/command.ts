import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";
import { listHostWorkspaces } from "../../../lib/host-workspaces";

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

		// Workspace records are host-owned: without an explicit host, fan out
		// once across the org's reachable hosts to map each id to its host.
		let hostIdByWorkspaceId: Map<string, string> | undefined;
		if (!explicitHostId) {
			const { workspaces, warnings: listWarnings } = await listHostWorkspaces({
				api: ctx.api,
				organizationId,
				userJwt: ctx.bearer,
			});
			for (const warning of listWarnings) {
				process.stderr.write(`Warning: ${warning}\n`);
			}
			hostIdByWorkspaceId = new Map(
				workspaces.map((workspace) => [workspace.id, workspace.hostId]),
			);
		}

		const deleted: string[] = [];
		const warnings: string[] = [];
		for (const id of ids) {
			const hostId = explicitHostId ?? hostIdByWorkspaceId?.get(id);
			if (!hostId) {
				throw new CLIError(`Workspace not found on any reachable host: ${id}`);
			}

			const target = resolveHostTarget({
				requestedHostId: hostId,
				organizationId,
				userJwt: ctx.bearer,
			});

			const result = await target.client.workspace.delete.mutate({ id });
			deleted.push(id);
			for (const warning of result.warnings ?? []) {
				warnings.push(`${id}: ${warning}`);
			}
		}

		const deleteMessage =
			deleted.length === 1
				? `Deleted workspace ${deleted[0]}`
				: `Deleted ${deleted.length} workspaces`;
		return {
			data: { deleted, warnings },
			message:
				warnings.length > 0
					? `${deleteMessage}\nWarnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
					: deleteMessage,
		};
	},
});
