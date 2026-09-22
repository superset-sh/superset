import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Delete workspaces by ID: cloud workspaces by default if your account has them (tearing down the sandbox stops its billing), else on this machine; --local or --host picks a host",
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
			const deleted: string[] = [];
			const missing: string[] = [];
			for (const id of ids) {
				const result = await ctx.api.cloudWorkspace.delete.mutate({ id });
				(result.deleted ? deleted : missing).push(id);
			}
			const summary =
				deleted.length === 1
					? `Deleted cloud workspace ${deleted[0]}`
					: `Deleted ${deleted.length} cloud workspaces`;
			return {
				data: { deleted, missing },
				message:
					missing.length > 0
						? `${summary}\nNot found: ${missing.join(", ")}`
						: summary,
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
