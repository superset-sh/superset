import { CLIError } from "@superset/cli-framework";
import { command } from "../../lib/command";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../lib/host/manifest";

export default command({
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

		if (isProcessAlive(manifest.pid)) {
			try {
				process.kill(manifest.pid, "SIGTERM");
			} catch (error) {
				throw new CLIError(
					`Failed to stop host service (pid ${manifest.pid}): ${
						error instanceof Error ? error.message : "unknown error"
					}`,
				);
			}

			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				if (!isProcessAlive(manifest.pid)) break;
				await new Promise((r) => setTimeout(r, 100));
			}

			if (isProcessAlive(manifest.pid)) {
				try {
					process.kill(manifest.pid, "SIGKILL");
				} catch {}
			}
		}

		removeManifest(organization.id);

		return {
			data: { pid: manifest.pid, organizationId: organization.id },
			message: `Stopped host service for ${organization.name}`,
		};
	},
});
