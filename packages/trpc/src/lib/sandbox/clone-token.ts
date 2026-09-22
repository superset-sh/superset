/**
 * The GitHub App's octokit for one installation. Installation tokens are
 * repository-scoped and expire in about an hour; the firewall carries them
 * as header rules, so nothing on the box ever holds one.
 */
import { App } from "@octokit/app";
import { env } from "../../env";

/** Shared by the clone and branch-listing paths. */
export async function installationOctokit(installationId: string) {
	if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY) {
		throw new Error("GitHub App is not configured");
	}
	const app = new App({
		appId: env.GH_APP_ID,
		privateKey: env.GH_APP_PRIVATE_KEY,
	});
	return app.getInstallationOctokit(Number(installationId));
}
