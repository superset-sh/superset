import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { readStdin } from "../../../../lib/plugins/inputs";

export default command({
	description:
		"Set a cloud workspace's description, as markdown. Inside a cloud workspace it defaults to that workspace",
	args: [
		positional("description").desc(
			"The description; read from stdin when omitted",
		),
	],
	options: {
		workspace: string().desc(
			"Cloud workspace id (default: the cloud workspace this runs in)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const id = options.workspace ?? process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
		if (!id) {
			throw new CLIError(
				"No cloud workspace",
				"Pass --workspace <id>, or run this inside a cloud workspace",
			);
		}
		const description = (
			(args.description as string | undefined) ??
			(await readStdin()) ??
			""
		).trim();
		if (!description) {
			throw new CLIError(
				"Empty description",
				"Pass the description or pipe it in",
			);
		}
		const result = await ctx.api.cloudWorkspace.setDescription.mutate({
			id,
			description,
		});
		return {
			data: { id, description: result.description },
			message: "Description updated",
		};
	},
});
