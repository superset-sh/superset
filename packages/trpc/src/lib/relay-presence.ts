interface PresenceInfo {
	online: boolean;
	lastSeenAt: number | null;
}

/**
 * Live host presence from the relay's Durable Objects — the socket is the
 * authority. Returns null when the call fails; callers treat that as offline.
 */
export async function fetchRelayPresence(
	relayUrl: string,
	token: string,
	hostIds: string[],
): Promise<Record<string, PresenceInfo> | null> {
	if (hostIds.length === 0) return {};
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
