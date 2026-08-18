/**
 * Pre-flight GET to /hosts/<id>/_whoowns before the WS upgrade: browsers don't
 * follow fly-replay on a WS upgrade (fails 1006) but do on HTTP, so this pins
 * fly edge affinity to the owning machine. The status is also the only signal
 * for *why* a stream fails (the WS API hides the upgrade status): 503 offline,
 * 401/403 unauthorized, 200-but-drops routing. Best-effort; null on failure.
 */

const PROBE_TIMEOUT_MS = 3_000;

export interface RelayAffinityProbe {
	/** HTTP status of the `_whoowns` preflight: 200 (host tunnel present),
	 * 503 (host not connected), 401/403 (unauthorized). */
	status: number;
	/** Relay region that owns the host tunnel, when the endpoint reports it. */
	region: string | null;
}

export async function primeRelayAffinity(
	wsUrl: string,
): Promise<RelayAffinityProbe | null> {
	let url: URL;
	try {
		url = new URL(wsUrl);
	} catch {
		return null;
	}
	const match = url.pathname.match(/^(\/hosts\/[^/]+)/);
	if (!match) return null; // not a /hosts/<id>/* URL — nothing to prime

	url.pathname = `${match[1]}/_whoowns`;
	url.protocol = url.protocol === "wss:" ? "https:" : "http:";
	// Keep search (token query param) so the relay can authenticate.

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const res = await fetch(url.toString(), {
			method: "GET",
			signal: controller.signal,
			cache: "no-store",
		});
		let region: string | null = null;
		try {
			const body = (await res.json()) as { region?: unknown };
			if (typeof body?.region === "string") region = body.region;
		} catch {
			// Error statuses may carry an empty / non-JSON body.
		}
		return { status: res.status, region };
	} catch {
		// Network error / timeout — the relay itself is unreachable.
		return null;
	} finally {
		clearTimeout(timer);
	}
}
