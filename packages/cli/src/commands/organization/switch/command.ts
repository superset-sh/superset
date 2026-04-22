import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Switch the active organization for this CLI",
	args: [positional("idOrSlug").required().desc("Organization id or slug")],
	run: async ({ ctx, args }) => {
		const idOrSlug = args.idOrSlug as string;
		const organizations = await ctx.api.user.myOrganizations.query();

		const match = organizations.find(
			(organization) =>
				organization.id === idOrSlug || organization.slug === idOrSlug,
		);
		if (!match) {
			throw new CLIError(
				`Organization not found: ${idOrSlug}`,
				"Run: superset organization list",
			);
		}

		const config = readConfig();
		config.organizationId = match.id;
		writeConfig(config);

		return {
			data: { id: match.id, name: match.name, slug: match.slug },
			message: `Switched to ${match.name}`,
		};
	},
});
