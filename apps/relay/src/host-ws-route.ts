// Parsing for the host WebSocket proxy route (`/hosts/:hostId/*`).
//
// The hostId can contain characters that browsers/WebSocket clients
// percent-encode in the URL path — most notably the colon in the
// `<org>:<machine>` routing key, which `encodeURIComponent` turns into
// `%3A`. Tunnels are registered (and looked up everywhere else) under the
// *decoded* hostId, so the WS proxy must decode the path segment before
// using it as the tunnel-map key. Extracting the raw segment instead makes
// the lookup miss and the channel open throw "Host not connected".
export interface HostWsRequest {
	/** Decoded routing key — matches how the tunnel is registered. */
	hostId: string;
	/** Path on the host-service, with the `/hosts/<hostId>` prefix removed. */
	path: string;
}

export function parseHostWsRequest(pathname: string): HostWsRequest {
	// Raw, still-encoded segment — used only for prefix slicing so the offset
	// matches the (also-encoded) pathname.
	const rawHostId = pathname.split("/")[2] ?? "";
	// Decode for the tunnel-map key. `decodeURIComponent` can throw on a
	// malformed escape; fall back to the raw segment rather than 500 the
	// upgrade.
	let hostId = rawHostId;
	try {
		hostId = decodeURIComponent(rawHostId);
	} catch {
		hostId = rawHostId;
	}
	const prefix = `/hosts/${rawHostId}`;
	const path = pathname.slice(prefix.length) || "/";
	return { hostId, path };
}
