import { string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { formatDistanceToNowStrict } from "date-fns";
import type { ApiClient } from "../../lib/api-client";
import { command } from "../../lib/command";
import { isProcessAlive, readManifest } from "../../lib/host/manifest";
import { resolveOrganizationFromContext } from "../../lib/resolve-org";

type HealthResult = {
	healthy: boolean;
	/** undefined = host-service predates the field (pre-#6415). */
	cloudRegistered?: boolean;
	registrationError?: string | null;
};

async function checkHealth(
	endpoint: string,
	authToken: string,
): Promise<HealthResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2_000);
	try {
		const res = await fetch(`${endpoint}/trpc/health.check`, {
			signal: controller.signal,
			headers: { Authorization: `Bearer ${authToken}` },
		});
		if (!res.ok) return { healthy: false };
		const body = (await res.json()) as {
			result?: { data?: { json?: Record<string, unknown> } };
		};
		const payload = body.result?.data?.json;
		return {
			healthy: true,
			cloudRegistered:
				typeof payload?.cloudRegistered === "boolean"
					? payload.cloudRegistered
					: undefined,
			registrationError:
				typeof payload?.registrationError === "string"
					? payload.registrationError
					: undefined,
		};
	} catch {
		return { healthy: false };
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchHostName(
	api: ApiClient,
	organizationId: string,
	hostId: string,
): Promise<{ name: string | null; listed: boolean | null }> {
	try {
		const hosts = await api.host.list.query({ organizationId });
		const host = hosts.find((row) => row.id === hostId);
		return { name: host?.name ?? null, listed: !!host };
	} catch {
		// API unreachable — unknown, not evidence of a missing registration.
		return { name: null, listed: null };
	}
}

export default command({
	description: "Check host service status",
	options: {
		org: string().desc("Organization (id, slug, or name); defaults to active"),
	},
	run: async ({ ctx, options }) => {
		const organization = await resolveOrganizationFromContext(
			ctx.api,
			ctx.config.organizationId,
			options.org,
		);

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

		const [health, cloudHost] = await Promise.all([
			checkHealth(manifest.endpoint, manifest.authToken),
			fetchHostName(ctx.api, organization.id, localHostId),
		]);
		const uptime = formatDistanceToNowStrict(new Date(manifest.startedAt));

		// A running host that isn't cloud-registered is invisible to hosts
		// list/automations while every local check passes (#6415). Trust the
		// host-service's own registration state when it reports one; fall
		// back to the cloud host list for older host-services.
		const cloudRegistered =
			health.cloudRegistered ??
			(cloudHost.listed === null ? undefined : cloudHost.listed);
		const registrationWarning =
			health.healthy && cloudRegistered === false
				? `\nWarning: not registered with the cloud for ${organization.name}${
						health.registrationError ? ` (${health.registrationError})` : ""
					} — hosts list and automations won't see this machine\nHint: check host-service.log; registration retries automatically, or run: superset stop && superset start`
				: "";

		return {
			data: {
				running: true,
				healthy: health.healthy,
				pid: manifest.pid,
				port: Number.parseInt(new URL(manifest.endpoint).port || "0", 10),
				endpoint: manifest.endpoint,
				organizationId: organization.id,
				hostId: localHostId,
				hostName: cloudHost.name,
				...(cloudRegistered === undefined ? {} : { cloudRegistered }),
				...(health.registrationError
					? { registrationError: health.registrationError }
					: {}),
				uptimeSec: Math.floor((Date.now() - manifest.startedAt) / 1000),
			},
			message: `${organization.name}: ${cloudHost.name ? `${cloudHost.name} (${localHostId.slice(0, 8)}…)` : `host ${localHostId.slice(0, 8)}…`} running (pid ${manifest.pid}, up ${uptime})${
				health.healthy ? "" : " — not responding to health check"
			}${registrationWarning}`,
		};
	},
});
