const HOSTS_PREFIX = "/hosts/";

/**
 * Returns the path suffix that follows the host routing-key segment.
 *
 * Hono decodes route params, while URL.pathname preserves percent encoding.
 * Slicing the raw pathname using a decoded `hostId` length therefore corrupts
 * paths whenever the routing key is encoded (for example, `org%3Amachine`).
 * Locate the next path separator instead so encoded and unencoded routing keys
 * produce the same local host-service path.
 */
export function pathAfterHostUrl(urlValue: string): string {
	const path = new URL(urlValue).pathname;
	if (!path.startsWith(HOSTS_PREFIX)) return path;

	const suffixStart = path.indexOf("/", HOSTS_PREFIX.length);
	return suffixStart === -1 ? "/" : path.slice(suffixStart);
}
