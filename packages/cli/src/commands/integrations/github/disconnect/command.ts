import { boolean, CLIError } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { confirmByName } from "../../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Disconnect the organization's GitHub App; its repositories leave every environment that uses them",
	options: {
		yes: boolean().desc(
			"Disconnect without asking; required without a terminal",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const installation = await ctx.api.integration.github.getInstallation.query(
			{ organizationId },
		);
		if (!installation) {
			return {
				data: { disconnected: false },
				message: "The GitHub App is not installed",
			};
		}
		await confirmByName({
			name: installation.accountLogin,
			consequence: `Disconnecting ${installation.accountLogin} removes its repositories from this organization's cloud environments`,
			yes: options.yes,
			rerun: "superset integrations github disconnect",
		});
		await ctx.api.integration.github.disconnect.mutate({ organizationId });
		return {
			data: { disconnected: true, account: installation.accountLogin },
			message: `Disconnected the GitHub App from ${installation.accountLogin}`,
		};
	},
});
