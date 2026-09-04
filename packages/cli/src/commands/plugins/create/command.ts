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
			.enum("url", "server", "none")
			.desc(
				"Where tools come from: url (remote MCP server), server (custom MCP you write), none (skills only)",
			),
		url: string().desc("MCP server URL, required when --kind url"),
		skills: boolean().desc("Scaffold a skills/ folder with a starter skill"),
		auth: boolean().desc("Include an OAuth2 block to fill in"),
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
			auth: Boolean(options.auth),
		});

		const next =
			options.kind === "server"
				? `Edit ${result.dir}/src/tools.ts, then run: superset plugins publish ${name}`
				: `Edit ${result.dir}/plugin.json, then run: superset plugins publish ${name}`;

		return {
			data: result.files.map((file) => ({ file: `${result.dir}/${file}` })),
			message: `Created ${name} (${result.files.length} files) and added it to ${ctx.marketplace.name}. ${next}`,
		};
	},
});
