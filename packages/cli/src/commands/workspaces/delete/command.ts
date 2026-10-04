import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Delete workspaces by ID: cloud workspaces by default if your account has them (archived: the sandbox stops a minute later, and the sandbox and its disk are deleted after 7 days), else on this machine; --local or --host picks a host",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Host the workspaces live on"),
		local: boolean().desc("The workspaces are on this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		if (!hostId) {
			const archived: string[] = [];
			const missing: string[] = [];
			for (const id of ids) {
				const result = await ctx.api.cloudWorkspace.archive.mutate({ id });
				(result.archived ? archived : missing).push(id);
			}
			if (missing.length > 0) {
				const alsoArchived =
					archived.length > 0 ? ` (archived: ${archived.join(", ")})` : "";
				throw new CLIError(
					`No cloud workspace in this organization: ${missing.join(", ")}${alsoArchived}`,
					"Pass --local or --host <id> if it lives on a machine",
				);
			}
			return {
				data: { archived },
				message:
					archived.length === 1
						? `Archived cloud workspace ${archived[0]}`
						: `Archived ${archived.length} cloud workspaces`,
			};
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const deleted: string[] = [];
		const warnings: string[] = [];
		for (const id of ids) {
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
