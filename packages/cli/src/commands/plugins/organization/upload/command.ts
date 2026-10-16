import { boolean, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { packPluginDirectory } from "../../../../lib/plugins/organization";

export default command({
	sandbox: false,
	description:
		"Upload a plugin directory (plugin.json, skills, commands) to your organization. A new version replaces the current one",
	args: [
		positional("path")
			.required()
			.desc("A plugin directory, or its plugin.json"),
	],
	options: {
		publish: boolean().desc("Publish it to members in the same step"),
	},
	run: async ({ ctx, args, options }) => {
		const uploaded = await ctx.api.plugins.organization.upload.mutate({
			bundle: packPluginDirectory(args.path as string),
		});

		const published =
			options.publish && !uploaded.publishedAt
				? await ctx.api.plugins.organization.setPublished.mutate({
						name: uploaded.name,
						published: true,
					})
				: uploaded;

		const next = published.publishedAt
			? `Members install it with: superset plugins install ${uploaded.name}`
			: `It is a draft. Publish it: superset plugins organization publish ${uploaded.name}`;

		return {
			data: { ...uploaded, publishedAt: published.publishedAt },
			message: `${uploaded.replaced ? `Replaced ${uploaded.name}@${uploaded.replaced} with` : "Uploaded"} ${uploaded.name}@${uploaded.version}. ${next}`,
		};
	},
});
