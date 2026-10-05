import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description:
		"Disconnect your GitHub account; cloud workspaces push as the Superset GitHub App again",
	run: async ({ ctx }) => {
		const result = await ctx.api.githubUser.disconnect.mutate();
		return { data: result, message: "Disconnected GitHub" };
	},
});
