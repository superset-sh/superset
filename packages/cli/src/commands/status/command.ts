import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../../lib/api-client";
import { command } from "../../lib/command";
import { isProcessAlive, readManifest } from "../../lib/host/manifest";

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

async function fetchHostName(
	api: ApiClient,
	organizationId: string,
	hostId: string,
): Promise<string | null> {
	try {
		const hosts = await api.host.list.query({ organizationId });
		return hosts.find((host) => host.id === hostId)?.name ?? null;
	} catch {
		return null;
	}
}

export default command({
	description: "Check host service status",
	run: async ({ ctx }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization)
			throw new CLIError("No active organization", "Run: superset auth login");

		const localHostId = getHostId();
		const manifest = readManifest(organization.id);

		if (!manifest) {
			return {
				data: {
					running: false,
					organizationId: organization.id,
					hostId: localHostId,
				},
				message: `Not running for ${organization.name} (hostId ${localHostId})`,
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
					hostId: localHostId,
				},
				message: `Stale manifest for ${organization.name} (pid ${manifest.pid} is dead)`,
			};
		}

		const [healthy, hostName] = await Promise.all([
			checkHealth(manifest.endpoint, manifest.authToken),
			fetchHostName(ctx.api, organization.id, localHostId),
		]);
		const uptimeSec = Math.floor((Date.now() - manifest.startedAt) / 1000);

		return {
			data: {
				running: true,
				healthy,
				pid: manifest.pid,
				port: Number.parseInt(new URL(manifest.endpoint).port || "0", 10),
				endpoint: manifest.endpoint,
				organizationId: organization.id,
				hostId: localHostId,
				hostName,
				uptimeSec,
			},
			message: `${organization.name}: ${hostName ? `${hostName} (${localHostId.slice(0, 8)}…)` : `host ${localHostId.slice(0, 8)}…`} running (pid ${manifest.pid}, ${uptimeSec}s)${
				healthy ? "" : " — not responding to health check"
			}`,
		};
	},
});
