import { boolean, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	parseDuration,
	parseStatus,
	resolveSession,
	waitForSession,
} from "../shared";

export default command({
	description: "Wait for an agent session to reach a lifecycle state",
	args: [positional("sessionId").required().desc("Full terminal session id")],
	options: {
		host: string().desc("Target a specific host (machineId)"),
		local: boolean().desc("Target this machine"),
		for: string()
			.required()
			.desc("State: working, permission, idle, or failed"),
		timeout: string().default("5m").desc("Maximum wait, e.g. 30s or 5m"),
	},
	run: async ({ ctx, args, options, signal }) => {
		const sessionId = args.sessionId as string;
		const match = await resolveSession(
			ctx,
			{
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			sessionId,
		);
		const result = await waitForSession({
			match,
			statuses: new Set([parseStatus(options.for)]),
			timeoutMs: parseDuration(options.timeout),
			signal,
		});
		return {
			data: result,
			message: `Session ${sessionId}: ${result.status}`,
		};
	},
});
