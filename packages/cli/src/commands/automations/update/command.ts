import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspacePin } from "../../../lib/host-workspaces";

export default command({
	description: "Update an automation's metadata (name, schedule, agent, host)",
	args: [positional("id").required().desc("Automation id")],
	options: {
		name: string().desc("New name"),
		rrule: string().desc("New RRule body (RFC 5545)"),
		timezone: string().desc("New IANA timezone"),
		dtstart: string().desc("New ISO 8601 start anchor"),
		agent: string().desc(
			"New host agent instance id or presetId (e.g. claude, codex, superset).",
		),
		host: string().desc("New target host id"),
		project: string().desc("New v2 project id"),
		workspace: string().desc("New v2 workspace id"),
		mcpScope: string().desc("Comma-separated MCP scope strings"),
		enabled: boolean().desc("Enable or pause the automation"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;

		if (options.enabled !== undefined) {
			await ctx.api.automation.setEnabled.mutate({
				id,
				enabled: options.enabled,
			});
		}

		const mcpScope =
			options.mcpScope !== undefined
				? options.mcpScope
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: undefined;

		// Workspace records are host-owned: resolve --workspace across the
		// org's hosts so the mutation carries the denormalized pin
		// (targetHostId + v2ProjectId) alongside the workspace id.
		let pin: { targetHostId?: string; v2ProjectId?: string } = {};
		if (options.workspace) {
			const organizationId = ctx.config.organizationId;
			if (!organizationId) {
				throw new CLIError(
					"No active organization",
					"Run: superset auth login",
				);
			}
			pin = await resolveWorkspacePin(
				{ api: ctx.api, organizationId, userJwt: ctx.bearer },
				{
					workspaceId: options.workspace,
					hostId: options.host ?? undefined,
					projectId: options.project ?? undefined,
				},
			);
		}

		const result = await ctx.api.automation.update.mutate({
			id,
			name: options.name,
			rrule: options.rrule,
			timezone: options.timezone,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			agent: options.agent,
			...(options.host !== undefined ? { targetHostId: options.host } : {}),
			...(options.project !== undefined
				? { v2ProjectId: options.project }
				: {}),
			...(options.workspace !== undefined
				? { v2WorkspaceId: options.workspace }
				: {}),
			...pin,
			...(mcpScope !== undefined ? { mcpScope } : {}),
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});
