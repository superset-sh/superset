import { CLIError } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Show current user, organization, and auth source",
	run: async ({ ctx }) => {
		const user = await ctx.api.user.me.query();
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization) throw new CLIError("No organization found");

		let authLine: string;
		if (ctx.authSource === "oauth" && ctx.config.auth) {
			const minutesLeft = Math.max(
				0,
				Math.round((ctx.config.auth.expiresAt - Date.now()) / 60_000),
			);
			authLine = `Session (expires in ${minutesLeft} min)`;
		} else if (ctx.authSource === "flag") {
			authLine = "API key (from --api-key flag)";
		} else {
			authLine = "API key (from SUPERSET_API_KEY env)";
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
