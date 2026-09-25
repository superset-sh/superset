/**
 * GET /hosts/<id>/_whoowns before a WebSocket upgrade. The WebSocket API hides
 * the upgrade's HTTP status, so this is the only way a client can learn *why*
 * a stream failed: 503 host offline, 401/403 unauthorized, 200 but the stream
 * still drops. Best-effort; null when the relay itself is unreachable.
 */

const PROBE_TIMEOUT_MS = 3_000;

export interface RelayHostProbe {
	/** HTTP status of the probe: 200 (host tunnel present), 503 (host not
	 * connected), 401/403 (unauthorized). */
	status: number;
}

export async function probeRelayHost(
	wsUrl: string,
): Promise<RelayHostProbe | null> {
	let url: URL;
	try {
		url = new URL(wsUrl);
	} catch {
		return null;
	}
	const match = url.pathname.match(/^(\/hosts\/[^/]+)/);
	if (!match) return null; // not a /hosts/<id>/* URL — nothing to probe

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
		return { status: res.status };
	} catch {
		// Network error / timeout — the relay itself is unreachable.
		return null;
	} finally {
		clearTimeout(timer);
	}
}
