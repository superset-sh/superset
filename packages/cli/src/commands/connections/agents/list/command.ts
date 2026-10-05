import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description: "List the agents signed in for your cloud workspaces",
	run: async ({ ctx }) => {
		const rows = await ctx.api.agentCredential.list.query();
		return {
			data: rows,
			message:
				rows
					.map((row) =>
						[
							row.agent,
							row.provider === "gateway" ? "gateway key" : row.kind,
							row.accountLabel,
						]
							.filter(Boolean)
							.join("  "),
					)
					.join("\n") ||
				"No agents signed in. Run: superset connections agents set claude --kind subscription",
		};
	},
});
