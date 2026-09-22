import fs from "node:fs";
import path from "node:path";
import {
	boolean,
	CLIError,
	positional,
	string,
	table,
} from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginRef } from "../../../lib/plugins/host";
import {
	type AuthInputSpec,
	missingInputsError,
	parseInputs,
} from "../../../lib/plugins/inputs";
import {
	ensureDefaultMarketplace,
	installPlugin,
} from "../../../lib/plugins/install";
import { pluginConnector } from "../../../lib/plugins/marketplace";

export default command({
	description:
		"Install a plugin: materialize its skills locally and record it on your account",
	args: [
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace to install from, when several offer this name",
		),
		inputs: string().desc(
			'Credential inputs as JSON, or "-" to read them from stdin',
		),
		update: boolean().desc(
			"Replace an existing install with the marketplace's current version, and re-sync its skills",
		),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["name", "version", "skills", "connection"],
			["PLUGIN", "VERSION", "SKILLS", "CONNECTION"],
			[20, 10, 8, 40],
		),
	run: async ({ ctx, args, options }) => {
		await ensureDefaultMarketplace();
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);

		const local = await installPlugin(name, marketplace, {
			update: Boolean(options.update),
		});

		let account: Awaited<
			ReturnType<typeof ctx.api.plugins.install.mutate>
		> | null = null;
		let accountError: string | null = null;
		try {
			account = await ctx.api.plugins.install.mutate({
				name,
				marketplace: local.marketplace,
			});
		} catch (error) {
			accountError = error instanceof Error ? error.message : String(error);
		}

		const slug = pluginConnector(
			JSON.parse(
				fs.readFileSync(path.join(local.installPath, "plugin.json"), "utf8"),
			),
		);

		const connector = slug
			? await ctx.api.connectors.get.query({ slug })
			: null;
		const methods = connector?.methods ?? [];
		const auth = methods.length === 1 ? methods[0] : undefined;

		let connection = accountError ? "account sync failed" : "not required";

		if (account?.needsConnection && methods.length > 1) {
			connection = `needs connection: superset plugins connect ${name} --method <${methods.map((m) => m.type).join("|")}>`;
		} else if (account?.needsConnection && auth && slug) {
			const connections = await ctx.api.plugins.connections.list.query({
				plugin: name,
			});

			if (connections.length > 0) {
				connection = `connected as ${connections[0]?.account ?? "unknown"}`;
			} else if (auth.type === "api_key") {
				const declared = (auth.inputs ?? []) as AuthInputSpec[];
				const provided = await parseInputs(
					options.inputs as string | undefined,
				);
				const missing = declared.filter(
					(input) => input.required !== false && !provided[input.name],
				);
				if (missing.length) {
					throw missingInputsError(name, missing, declared);
				}
				const organization = await ctx.api.user.myOrganization.query();
				if (!organization) {
					throw new CLIError(
						"You need to be part of an organization to connect accounts.",
					);
				}
				await ctx.api.connectors.connectApiKey.mutate({
					organizationId: organization.id,
					slug,
					inputs: provided,
				});
				connection = `connected ${slug}`;
			} else {
				connection = "authorize in a browser";
			}
		}

		const next =
			connection === "authorize in a browser"
				? ` Authorize it: superset plugins connect ${name}`
				: accountError
					? ` Its skills work, but tools will not until the account install succeeds: ${accountError}`
					: "";

		return {
			data: [
				{
					name: local.name,
					version: local.version,
					marketplace: local.marketplace,
					skills: local.skills,
					connection,
				},
			],
			message: `Installed ${local.name}@${local.version}. ${local.skills} skill${local.skills === 1 ? "" : "s"} synced.${next}`,
		};
	},
});
