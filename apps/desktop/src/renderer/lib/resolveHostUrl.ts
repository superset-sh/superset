import { env } from "renderer/env.renderer";

/**
 * Resolve the host-service URL from a host target.
 * Local targets use the active host URL; remote targets use the relay.
 */
export function resolveHostUrl(
	hostTarget: unknown,
	activeHostUrl: string | null,
): string | null {
	if (
		hostTarget &&
		typeof hostTarget === "object" &&
		"kind" in (hostTarget as Record<string, unknown>)
	) {
		const target = hostTarget as { kind: string; hostId?: string };
		if (target.kind === "local") return activeHostUrl;
		if (target.hostId) return `${env.RELAY_URL}/hosts/${target.hostId}`;
	}
	return activeHostUrl;
}
