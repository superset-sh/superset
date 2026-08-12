interface PresenceInfo {
	online: boolean;
	lastSeenAt: number | null;
}

const HEALTH_TTL_MS = 5 * 60_000;
const healthCache = new Map<string, { proto2: boolean; at: number }>();

async function supportsPresence(relayUrl: string): Promise<boolean> {
	const cached = healthCache.get(relayUrl);
	if (cached && Date.now() - cached.at < HEALTH_TTL_MS) return cached.proto2;
	let proto2 = false;
	try {
		const res = await fetch(`${relayUrl}/health`, {
			signal: AbortSignal.timeout(3_000),
		});
		const body = (await res.json()) as { proto?: number };
		proto2 = body.proto === 2;
	} catch {
		return false;
	}
	healthCache.set(relayUrl, { proto2, at: Date.now() });
	return proto2;
}

/**
 * Live host presence from the relay's Durable Objects — the socket is the
 * authority. Returns null when the relay predates `/presence` (v1/Fly) or the
 * call fails; callers fall back to the legacy `v2_hosts.is_online` flag,
 * which the v1 relay still maintains.
 */
export async function fetchRelayPresence(
	relayUrl: string,
	token: string,
	hostIds: string[],
): Promise<Record<string, PresenceInfo> | null> {
	if (hostIds.length === 0) return {};
	if (!(await supportsPresence(relayUrl))) return null;
	try {
		const res = await fetch(
			`${relayUrl}/presence?hostIds=${encodeURIComponent(hostIds.join(","))}`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(5_000),
			},
		);
		if (!res.ok) return null;
		const body = (await res.json()) as {
			hosts: Record<string, PresenceInfo>;
		};
		return body.hosts;
	} catch {
		return null;
	}
}
