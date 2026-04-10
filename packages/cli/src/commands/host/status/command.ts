import { CLIError, command } from "@superset/cli-framework";
import { readConfig } from "../../../lib/config";
import { isProcessAlive, readManifest } from "../../../lib/host/manifest";

async function checkHealth(
	endpoint: string,
	authToken: string,
): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2_000);
		const res = await fetch(`${endpoint}/trpc/health.check`, {
			signal: controller.signal,
			headers: { Authorization: `Bearer ${authToken}` },
		});
		clearTimeout(timeout);
		return res.ok;
	} catch {
		return false;
	}
}

export default command({
	description: "Check host service status",
	run: async () => {
		const config = readConfig();

		if (!config.activeOrg) {
			throw new CLIError("No active organization", "Run: superset org switch");
		}

		const { id: organizationId, name: orgName } = config.activeOrg;
		const manifest = readManifest(organizationId);

		if (!manifest) {
			return {
				data: { running: false, organizationId },
				message: `Not running for ${orgName}`,
			};
		}

		const alive = isProcessAlive(manifest.pid);
		if (!alive) {
			return {
				data: {
					running: false,
					stale: true,
					pid: manifest.pid,
					organizationId,
				},
				message: `Stale manifest for ${orgName} (pid ${manifest.pid} is dead)`,
			};
		}

		const healthy = await checkHealth(manifest.endpoint, manifest.authToken);
		const uptimeMs = Date.now() - manifest.startedAt;
		const uptimeSec = Math.floor(uptimeMs / 1000);

		return {
			data: {
				running: true,
				healthy,
				pid: manifest.pid,
				endpoint: manifest.endpoint,
				organizationId,
				uptimeSec,
			},
			message: `${orgName}: running (pid ${manifest.pid}, ${uptimeSec}s)${
				healthy ? "" : " — not responding to health check"
			}`,
		};
	},
});
