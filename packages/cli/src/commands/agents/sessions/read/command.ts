import { boolean, number, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveSession } from "../shared";

export default command({
	description: "Read recent plain-text output from an agent session",
	args: [positional("sessionId").required().desc("Full terminal session id")],
	options: {
		host: string().desc("Target a specific host (machineId)"),
		local: boolean().desc("Target this machine"),
		lines: number().int().min(1).max(1000).default(120).desc("Logical lines"),
	},
	run: async ({ ctx, args, options }) => {
		const sessionId = args.sessionId as string;
		const match = await resolveSession(
			ctx,
			{
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			sessionId,
		);
		const result = await match.client.terminalAgents.read.query({
			terminalId: sessionId,
			lines: options.lines,
		});
		return { data: result, message: result.output };
	},
});
