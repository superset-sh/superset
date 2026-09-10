import {
	type HostInstallSource,
	parseHostInstallSource,
} from "@superset/shared/host-version";
import type { HostServiceClient } from "renderer/lib/host-service-client";

export interface HostServiceInfo {
	version: string;
	installSource: HostInstallSource;
	updatable: boolean;
	/** From `host.info`, which needs the host to reach the cloud; absent otherwise. */
	platform?: string;
	arch?: string;
	uptime?: number;
}

/**
 * `health.check` answers without the cloud, so the version is always
 * known; `host.info` adds platform and uptime when the host can reach the
 * API, and is simply left out when it cannot.
 */
export async function readHostServiceInfo(
	client: HostServiceClient,
): Promise<HostServiceInfo> {
	const [health, info, updateStatus] = await Promise.all([
		client.health.check.query(undefined, {
			signal: AbortSignal.timeout(10_000),
		}),
		client.host.info
			.query(undefined, { signal: AbortSignal.timeout(2_000) })
			.catch(() => null),
		client.system.updateStatus
			.query(undefined, { signal: AbortSignal.timeout(2_000) })
			.catch(() => null),
	]);
	return {
		version: health.version,
		updatable: updateStatus?.updatable === true,
		installSource: parseHostInstallSource(
			health.installSource ?? info?.installSource,
		),
		...(info
			? { platform: info.platform, arch: info.arch, uptime: info.uptime }
			: {}),
	};
}
