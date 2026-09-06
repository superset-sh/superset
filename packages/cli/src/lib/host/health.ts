import { isProcessAlive, readManifest } from "./manifest";

export type HostHealth = {
	healthy: boolean;
	/** undefined = host-service predates the field (pre-#6415). */
	cloudRegistered?: boolean;
	registrationError?: string | null;
	/**
	 * false = the host was started without a relay URL (Remote Access off):
	 * registered, but offline for hosts list and unreachable for automations.
	 * null = not settled yet; undefined = host-service predates the field.
	 */
	relayEnabled?: boolean | null;
};

export async function checkHostHealth(
	endpoint: string,
	authToken: string,
): Promise<HostHealth> {
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
			relayEnabled:
				typeof payload?.relayEnabled === "boolean" ||
				payload?.relayEnabled === null
					? payload.relayEnabled
					: undefined,
		};
	} catch {
		return { healthy: false };
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Health of the host-service running on this machine for the org, or null
 * when there is none to ask (no manifest, or its process is gone).
 */
export async function checkLocalHostHealth(
	organizationId: string,
): Promise<HostHealth | null> {
	const manifest = readManifest(organizationId);
	if (!manifest || !isProcessAlive(manifest.pid)) return null;
	return checkHostHealth(manifest.endpoint, manifest.authToken);
}
