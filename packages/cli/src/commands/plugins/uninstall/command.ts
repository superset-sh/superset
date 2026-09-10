import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginRef } from "../../../lib/plugins/host";
import { removePlugin } from "../../../lib/plugins/install";

export default command({
	description: "Uninstall a plugin and drop its skills",
	aliases: ["remove"],
	args: [
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace's install to remove, when several offer this name",
		),
	},
	run: async ({ ctx, args, options }) => {
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);

		let accountError: string | null = null;
		try {
			await ctx.api.plugins.uninstall.mutate({ name, marketplace });
		} catch (error) {
			const code =
				error && typeof error === "object" && "data" in error
					? (error as { data?: { code?: string } }).data?.code
					: undefined;
			if (code !== "NOT_FOUND") {
				accountError = error instanceof Error ? error.message : String(error);
			}
		}

		const removed = await removePlugin(name, marketplace);

		return {
			data: { name: removed.name, marketplace: removed.marketplace },
			message: accountError
				? `Removed ${removed.name}@${removed.version} (${removed.marketplace}) from this machine, but the account removal could not be confirmed: ${accountError}`
				: `Removed ${removed.name}@${removed.version} (${removed.marketplace}).`,
		};
	},
});
