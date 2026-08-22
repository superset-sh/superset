import type { PortScheme } from "./types/ports";

/**
 * The URL a detected port opens at, in the in-app browser or externally. A port the
 * workspace's `.superset/ports.json` doesn't declare a scheme for opens over http.
 */
export function buildPortUrl(port: {
	port: number;
	scheme?: PortScheme | null;
}): string {
	return `${port.scheme ?? "http"}://localhost:${port.port}`;
}
