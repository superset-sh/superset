// Parse a `/hosts/:hostId/*` WebSocket upgrade URL into the pieces the tunnel
// manager needs.
//
// Routing keys are `<org>:<machineId>`. Browser WebSocket clients build the URL
// with encodeURIComponent, so the colon arrives percent-encoded (`%3A`) and
// `URL.pathname` keeps it that way. Hosts register their tunnel under the
// *decoded* key (Hono decodes the `hostId` query param on /tunnel) and every
// HTTP route resolves the host via Hono's decoded `c.req.param("hostId")`, so
// the channel lookup must use the decoded id too — otherwise `tunnels.get()`
// misses and `openWsChannel` throws "Host not connected" (surfaced to the
// client as 1011 "Failed to open channel"). See #5243.
//
// The forwarded `path`/`query` are intentionally left encoded: they're handed
// straight to the host's local `new URL(path, ...)`, which expects a valid URL.
export function parseHostWsRoute(rawUrl: string): {
	hostId: string;
	path: string;
	query: string | undefined;
} {
	const url = new URL(rawUrl);
	const rawHostSegment = url.pathname.split("/")[2] ?? "";
	const prefix = `/hosts/${rawHostSegment}`;
	const path = url.pathname.slice(prefix.length) || "/";
	const query = url.search.slice(1) || undefined;
	return { hostId: decodeURIComponent(rawHostSegment), path, query };
}
