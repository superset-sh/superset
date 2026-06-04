/**
 * Many WebSocket clients (browsers especially) don't transparently follow
 * fly-replay headers on the WS upgrade response — they see a non-101
 * status and fail the handshake with code 1006. To avoid that flicker, we
 * pre-flight a plain HTTP GET to the same /hosts/<id>/_whoowns endpoint
 * first. fly-replay is fully transparent for HTTP, and the GET locks fly's
 * edge affinity to the owning machine for subsequent requests, so the
 * follow-up WS upgrade lands on the right instance and gets a clean 101.
 *
 * Best-effort: if the probe fails or times out, we still try the WS — it
 * just may briefly flicker during the implicit retry.
 */

const PROBE_TIMEOUT_MS = 3_000;

export async function primeRelayAffinity(wsUrl: string): Promise<void> {
	try {
		const url = new URL(wsUrl);
		const match = url.pathname.match(/^(\/hosts\/[^/]+)/);
		if (!match) return; // not a /hosts/<id>/* URL — nothing to prime
		url.pathname = `${match[1]}/_whoowns`;
		url.protocol = url.protocol === "wss:" ? "https:" : "http:";
		// Keep search (token query param) so the relay can authenticate.

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
		try {
			await fetch(url.toString(), {
				method: "GET",
				signal: controller.signal,
				cache: "no-store",
			});
		} finally {
			clearTimeout(timer);
		}
	} catch {
		// Best-effort.
	}
}
