/**
 * Query method override supported by the host-service endpoint at `hostUrl`.
 *
 * The desktop and its loopback host service ship together, so the local
 * server supports tRPC's POST query override. Remote hosts can be one release
 * behind the desktop and older host services reject POST query procedures
 * with METHOD_NOT_SUPPORTED, so relay and sandbox URLs retain tRPC's default
 * GET-for-query behavior.
 */
export function getHostServiceQueryMethodOverride(
	hostUrl: string,
): "POST" | undefined {
	try {
		const hostname = new URL(hostUrl).hostname;
		return hostname === "127.0.0.1" ||
			hostname === "localhost" ||
			hostname === "[::1]"
			? "POST"
			: undefined;
	} catch {
		return undefined;
	}
}
