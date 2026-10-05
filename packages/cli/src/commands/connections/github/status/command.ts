import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description: "Show which GitHub account your cloud workspaces act as",
	run: async ({ ctx }) => {
		const { available, connection } = await ctx.api.githubUser.get.query();
		return {
			data: { available, connection },
			message: connection
				? `Connected as ${connection.login}`
				: available
					? "Not connected; cloud workspaces push as the Superset GitHub App. Run: superset connections github connect"
					: "GitHub account connections are not set up on this server",
		};
	},
});
