import { CLIError, positional, string } from "@superset/cli-framework";
import {
	ORGANIZATION_PLUGIN_ACCESS,
	type OrganizationPluginPolicy,
} from "@superset/shared/plugins";
import { command } from "../../../../lib/command";

const access = () =>
	string()
		.enum(...ORGANIZATION_PLUGIN_ACCESS)
		.desc("unavailable, available, or installed for everyone in the role");

export default command({
	sandbox: false,
	description:
		"Choose, per role, whether a plugin is unavailable, available to install, or installed for everyone",
	args: [positional("name").required().desc("Plugin name")],
	options: { member: access(), admin: access(), owner: access() },
	run: async ({ ctx, args, options }) => {
		const name = args.name as string;
		const plugin = (await ctx.api.plugins.organization.list.query()).find(
			(p) => p.name === name,
		);
		if (!plugin) {
			throw new CLIError(
				`Your organization has no plugin "${name}".`,
				"See what it has: superset plugins organization list",
			);
		}
		const policy: OrganizationPluginPolicy = { ...plugin.policy };
		for (const role of ["member", "admin", "owner"] as const) {
			const value = options[role] as OrganizationPluginPolicy[typeof role];
			if (value) policy[role] = value;
		}
		const result = await ctx.api.plugins.organization.setPolicy.mutate({
			name,
			policy,
		});
		return {
			data: result,
			message: `${name}: ${Object.entries(result.policy)
				.map(([role, value]) => `${role} ${value}`)
				.join(", ")}`,
		};
	},
});
