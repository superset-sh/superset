import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveAutomationTarget } from "../resolveAutomationTarget";

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

		// Retargeting (--workspace or --project) re-derives targetHostId +
		// v2ProjectId; the resource must exist on the target host.
		let target: { targetHostId: string; v2ProjectId: string } | undefined;
		if (options.workspace || options.project) {
			const organizationId = ctx.config.organizationId;
			if (!organizationId) {
				throw new CLIError(
					"No active organization",
					"Run: superset auth login",
				);
			}
			target = await resolveAutomationTarget({
				organizationId,
				userJwt: ctx.bearer,
				hostId: options.host ?? undefined,
				workspaceId: options.workspace ?? undefined,
				projectId: options.project ?? undefined,
			});
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
			...target,
			...(mcpScope !== undefined ? { mcpScope } : {}),
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});
