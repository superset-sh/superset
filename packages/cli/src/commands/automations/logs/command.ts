import { number, positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { formatAutomationDate } from "../format";

export default command({
	description: "List recent runs of an automation",
	args: [positional("id").required().desc("Automation id")],
	options: {
		limit: number()
			.int()
			.min(1)
			.max(100)
			.default(20)
			.desc("Max runs to return (1-100)"),
	},
	run: async ({ ctx, args, options }) => {
		const automationId = args.id as string;
		return ctx.api.automation.listRuns.query({
			automationId,
			limit: options.limit,
		});
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				id: row.id,
				status: row.status,
				scheduledFor: formatAutomationDate(
					row.scheduledFor as Date | string | null | undefined,
					null,
				),
				dispatchedAt: formatAutomationDate(
					row.dispatchedAt as Date | string | null | undefined,
					null,
				),
				host: row.hostId ?? "—",
			})),
			["id", "status", "scheduledFor", "dispatchedAt", "host"],
			["RUN ID", "STATUS", "SCHEDULED", "DISPATCHED", "HOST"],
		),
});
