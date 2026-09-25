import { boolean, positional, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { findMarketplace } from "../../../lib/plugins/marketplace";
import { type PluginKind, scaffoldPlugin } from "../../../lib/plugins/scaffold";

export default command({
	description: "Scaffold a new plugin and add it to the marketplace",
	args: [
		positional("name")
			.required()
			.desc("Plugin name: lowercase letters, digits, dots and hyphens"),
	],
	options: {
		kind: string()
			.required()
			.enum("url", "none")
			.desc(
				"Where tools come from: url (remote MCP server), none (skills only)",
			),
		url: string().desc("MCP server URL, required when --kind url"),
		skills: boolean().desc("Scaffold a skills/ folder with a starter skill"),
		connector: string().desc(
			"Slug of the connector this plugin needs a connection to",
		),
		"display-name": string().desc(
			"Name shown in the UI (default: derived from name)",
		),
		description: string().desc("One-line description"),
		category: string().desc("Category shown in the UI"),
	},
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["file"],
			["CREATED"],
			[60],
		),
	run: async ({ args, options }) => {
		const ctx = findMarketplace();
		const name = args.name as string;

		const result = scaffoldPlugin(ctx, {
			name,
			kind: options.kind as PluginKind,
			url: options.url as string | undefined,
			displayName: options["display-name"] as string | undefined,
			description: options.description as string | undefined,
			category: options.category as string | undefined,
			skills: Boolean(options.skills),
			connector: options.connector as string | undefined,
		});

		return {
			data: result.files.map((file) => ({ file: `${result.dir}/${file}` })),
			message: `Created ${name} (${result.files.length} files) and added it to ${ctx.marketplace.name}. Edit ${result.dir}/plugin.json, then run: superset plugins publish ${name}`,
		};
	},
});
