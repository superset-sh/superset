/**
 * The one policy every viewer loads a page under. The only host a page may
 * reach is its own storage hub on the realtime origin, so `connect-src` lists
 * that and nothing else: everything a page renders still has to be in the
 * document, and origin isolation — not this header — is what keeps a page's
 * script from reaching anything else of ours. `script-src 'self'` admits the
 * runtime the origin injects; `'unsafe-inline'` is what agent-authored
 * single-file pages are made of.
 */
export function pageContentSecurityPolicy(
	frameAncestors: readonly string[],
	realtimeOrigin?: string,
): string {
	const connectSources = realtimeOrigin
		? [realtimeOrigin.replace(/^http/, "ws"), realtimeOrigin]
		: [];
	return [
		"default-src 'none'",
		connectSources.length
			? `connect-src ${connectSources.join(" ")}`
			: "connect-src 'none'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		// `'self'` is what lets a directory publish's own assets load. The
		// scheme sources cover remote media; without `'self'` a page's own
		// image only loads because production happens to be https, and the
		// same page served over http blocks itself.
		"img-src 'self' data: blob: https:",
		"media-src 'self' data: blob: https:",
		"font-src 'self' data: https:",
		"worker-src blob:",
		"form-action 'none'",
		"base-uri 'none'",
		`frame-ancestors ${frameAncestors.join(" ")}`,
	].join("; ");
}
