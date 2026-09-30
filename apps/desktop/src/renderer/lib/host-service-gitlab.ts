import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { hostSupportsGitLab } from "@superset/shared/host-version";
import { getHostServiceClientByUrl } from "./host-service-client";

const CACHE_MS = 30_000;
const supportByHost = new Map<
	string,
	{ expiresAt: number; promise: Promise<void> }
>();

export async function assertGitLabHostSupport(hostUrl: string): Promise<void> {
	const cached = supportByHost.get(hostUrl);
	if (cached && cached.expiresAt > Date.now()) return cached.promise;

	const promise = getHostServiceClientByUrl(hostUrl)
		.health.check.query(undefined, { signal: AbortSignal.timeout(10_000) })
		.then((health) => {
			if (hostSupportsGitLab(health.version, health.capabilities)) return;
			throw new Error(
				i18n._(
					msg({
						message:
							"The selected host does not support GitLab. Update its host service.",
					}),
				),
			);
		});
	supportByHost.set(hostUrl, { expiresAt: Date.now() + CACHE_MS, promise });
	try {
		await promise;
	} catch (error) {
		supportByHost.delete(hostUrl);
		throw error;
	}
}
