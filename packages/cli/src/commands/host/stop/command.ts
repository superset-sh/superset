import { CLIError, command } from "@superset/cli-framework";
import { getActiveOrgId } from "../../../lib/active-org";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../../lib/host/manifest";
import { resolveAuth } from "../../../lib/resolve-auth";

export default command({
	description: "Stop the host service daemon",
	run: async (opts) => {
		const { api, bearer, authSource } = await resolveAuth(
			(opts.options as { apiKey?: string }).apiKey,
		);
		const organizationId = await getActiveOrgId(api, bearer, authSource);
		const orgRecord = await api.user.myOrganization.query();
		const orgName = orgRecord?.name ?? organizationId;

		const manifest = readManifest(organizationId);
		if (!manifest) {
			return {
				data: { running: false },
				message: `No host service running for ${orgName}`,
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

			// Wait for the process to actually exit so concurrent `host start`
			// calls can't race ahead and spawn a duplicate.
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				if (!isProcessAlive(manifest.pid)) break;
				await new Promise((r) => setTimeout(r, 100));
			}

			if (isProcessAlive(manifest.pid)) {
				// Escalate to SIGKILL if it refuses to exit
				try {
					process.kill(manifest.pid, "SIGKILL");
				} catch {}
			}
		}

		removeManifest(organizationId);

		return {
			data: { pid: manifest.pid, organizationId },
			message: `Stopped host service for ${orgName}`,
		};
	},
});
