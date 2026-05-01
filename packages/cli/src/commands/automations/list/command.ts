import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { formatAutomationDate } from "../format";

export default command({
	description: "List automations in the organization",
	options: {
		name: string()
			.alias("n")
			.desc("Filter by name (case-insensitive substring match)"),
	},
	run: async ({ ctx, options }) => {
		return await ctx.api.automation.list.query(
			options.name ? { name: options.name } : undefined,
		);
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				id: row.id,
				name: row.name,
				agent: (row.agentConfig as { id?: string } | null)?.id,
				schedule: row.scheduleText ?? row.rrule,
				enabled: row.enabled ? "yes" : "no",
				nextRun: formatAutomationDate(
					row.nextRunAt as Date | string | null | undefined,
					row.timezone as string | null | undefined,
				),
			})),
			["id", "name", "agent", "schedule", "enabled", "nextRun"],
			["ID", "NAME", "AGENT", "SCHEDULE", "ENABLED", "NEXT RUN"],
		),
});
