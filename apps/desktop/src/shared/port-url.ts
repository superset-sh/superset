import type { PortScheme } from "./types/ports";

/** The bits of a port row that decide its URL. */
interface PortUrlParts {
	port: number;
	/**
	 * Scheme declared in `.superset/ports.json`. Null for a port that isn't declared
	 * there, and `undefined` when the row came from a host-service too old to send it —
	 * both mean plain http.
	 */
	scheme?: PortScheme | null;
}

/**
 * The URL a detected port opens at, in the in-app browser or externally.
 *
 * A dev server that only speaks TLS (Next's `--experimental-https`, a Vite `server.https`
 * config, anything behind a local cert) cannot answer an `http://` request at all — the
 * connection dies in the TLS handshake — so those ports declare `"scheme": "https"` and
 * open over https instead.
 */
export function buildPortUrl(port: PortUrlParts): string {
	return `${port.scheme ?? "http"}://localhost:${port.port}`;
}
