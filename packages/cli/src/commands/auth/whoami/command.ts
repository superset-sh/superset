import { CLIError } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Show current user, organization, and auth source",
	run: async ({ ctx }) => {
		const user = await ctx.api.user.me.query();
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization) throw new CLIError("No organization found");

		let authLine: string;
		if (ctx.authSource === "oauth") {
			authLine = "Session";
		} else if (ctx.authSource === "override") {
			authLine = "API key (from --api-key flag or SUPERSET_API_KEY env)";
		} else {
			authLine = "API key (stored via auth login --api-key)";
		}

		return {
			data: {
				userId: user.id,
				email: user.email,
				name: user.name,
				organizationId: organization.id,
				organizationName: organization.name,
				authSource: ctx.authSource,
			},
			message: [
				`Signed in as ${user.name} (${user.email})`,
				`Organization: ${organization.name}`,
				`Auth: ${authLine}`,
			].join("\n"),
		};
	},
});
