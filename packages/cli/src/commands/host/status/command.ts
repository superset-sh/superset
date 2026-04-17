import { CLIError } from "@superset/cli-framework";
import { command } from "../../../lib/command";
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
	run: async ({ ctx }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		const manifest = readManifest(organization.id);
		if (!manifest) {
			return {
				data: { running: false, organizationId: organization.id },
				message: `Not running for ${organization.name}`,
			};
		}

		const alive = isProcessAlive(manifest.pid);
		if (!alive) {
			return {
				data: {
					running: false,
					stale: true,
					pid: manifest.pid,
					organizationId: organization.id,
				},
				message: `Stale manifest for ${organization.name} (pid ${manifest.pid} is dead)`,
			};
		}

		const healthy = await checkHealth(manifest.endpoint, manifest.authToken);
		const uptimeSec = Math.floor((Date.now() - manifest.startedAt) / 1000);

		return {
			data: {
				running: true,
				healthy,
				pid: manifest.pid,
				endpoint: manifest.endpoint,
				organizationId: organization.id,
				uptimeSec,
			},
			message: `${organization.name}: running (pid ${manifest.pid}, ${uptimeSec}s)${
				healthy ? "" : " — not responding to health check"
			}`,
		};
	},
});
