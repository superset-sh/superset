import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePluginRef } from "../../../lib/plugins/host";
import { setPluginEnabled } from "../../../lib/plugins/install";

export default command({
	description: "Enable an installed plugin",
	args: [
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace's install to change, when several offer this name",
		),
	},
	run: async ({ ctx, args, options }) => {
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);

		const updated = await setPluginEnabled(name, true, marketplace);

		let accountError: string | null = null;
		try {
			await ctx.api.plugins.setEnabled.mutate({
				name,
				marketplace: updated.marketplace,
				enabled: true,
			});
		} catch (error) {
			accountError = error instanceof Error ? error.message : String(error);
		}

		return {
			data: {
				name: updated.name,
				marketplace: updated.marketplace,
				enabled: updated.enabled,
			},
			message: accountError
				? `${updated.name} is enabled on this machine, but the account still disagrees: ${accountError}`
				: `${updated.name} enabled.`,
		};
	},
});
