import { CLIError, command } from "@superset/cli-framework";
import { getApiUrl } from "../../../lib/config";
import { resolveAuth } from "../../../lib/resolve-auth";

function formatExpiresIn(expiresAt: number): string {
	const ms = Math.max(0, expiresAt - Date.now());
	const minutes = Math.round(ms / 60_000);
	if (minutes >= 60) {
		const hours = Math.floor(minutes / 60);
		const rem = minutes % 60;
		return `${hours}h ${rem}m`;
	}
	return `${minutes} min`;
}

export default command({
	description: "Show current user, organization, and auth source",

	run: async (opts) => {
		const { config, api, authSource } = await resolveAuth(
			(opts.options as { apiKey?: string }).apiKey,
		);

		const user = await api.user.me.query();
		const org = await api.user.myOrganization.query();
		if (!org) throw new CLIError("No organization found");

		const apiUrl = getApiUrl(config);

		let authLine: string;
		if (authSource === "oauth" && config.auth) {
			authLine = `OAuth session (expires in ${formatExpiresIn(
				config.auth.expiresAt,
			)})`;
		} else if (authSource === "flag") {
			authLine = "API key (from --api-key flag)";
		} else {
			authLine = "API key (from SUPERSET_API_KEY env)";
		}

		const message = [
			`Signed in as ${user.name} (${user.email})`,
			`Organization: ${org.name}`,
			`Auth: ${authLine}`,
			`API: ${apiUrl}`,
		].join("\n");

		return {
			data: {
				userId: user.id,
				email: user.email,
				name: user.name,
				organizationId: org.id,
				organizationName: org.name,
				authSource,
				apiUrl,
				expiresAt:
					authSource === "oauth" && config.auth ? config.auth.expiresAt : null,
			},
			message,
		};
	},
});
