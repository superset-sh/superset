import { CLIError } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { readManifest, removeManifestIfOwnedBy } from "../../lib/host/manifest";
import { terminateHost } from "../../lib/host/terminate";

export default command({
	sandbox: false,
	description: "Stop the host service daemon",
	run: async ({ ctx }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		const manifest = readManifest(organization.id);
		if (!manifest) {
			return {
				data: { running: false },
				message: `No host service running for ${organization.name}`,
			};
		}

		try {
			await terminateHost(manifest.pid);
		} catch (error) {
			throw new CLIError(
				`Failed to stop host service (pid ${manifest.pid}): ${
					error instanceof Error ? error.message : "unknown error"
				}`,
			);
		}

		removeManifestIfOwnedBy(organization.id, manifest.pid);

		return {
			data: { pid: manifest.pid, organizationId: organization.id },
			message: `Stopped host service for ${organization.name}`,
		};
	},
});
