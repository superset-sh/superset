import { CLIError, command } from "@superset/cli-framework";
import { createApiClient } from "../../../lib/api-client";
import { readConfig } from "../../../lib/config";

export default command({
	description: "Show current user and organization",

	run: async () => {
		const config = readConfig();
		if (!config.auth) {
			throw new CLIError("Not logged in", "Run: superset auth login");
		}
		const api = createApiClient(config);
		const user = await api.user.me.query();
		const org = await api.user.myOrganization.query();

		if (!org) {
			throw new CLIError("No organization found");
		}

		return {
			data: {
				userId: user.id,
				email: user.email,
				name: user.name,
				organizationId: org.id,
				organizationName: org.name,
			},
			message: `${user.name} (${user.email})\nOrganization: ${org.name}`,
		};
	},
});
