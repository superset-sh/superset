/**
 * Resolving an upstream URL for a request target that arrived from outside —
 * a path the gate is proxying, a frame the relay sent — when the resolved
 * origin is about to be handed a secret.
 *
 * `new URL(target, origin)` treats the origin as a base to be overridden, not
 * a boundary: a protocol-relative target replaces it outright, and appending
 * the target to an origin string instead lets a leading `@` turn the origin
 * into userinfo. Either way the caller then attaches the host secret to
 * whatever host the target named.
 */

/**
 * C0 controls, space and DEL. The URL parser strips tab, CR and LF *before*
 * resolving, so `/<tab>/evil.example` becomes protocol-relative after any
 * naive prefix check has already passed; none of them belong in a request
 * target regardless.
 */
function hasForbiddenCharacter(target: string): boolean {
	for (let i = 0; i < target.length; i++) {
		const code = target.charCodeAt(i);
		if (code <= 0x20 || code === 0x7f) return true;
	}
	return false;
}

/**
 * Whether `requestTarget` is origin-form — an absolute path with an optional
 * query, the only shape either protocol carries — and so cannot name a host
 * of its own. For a hop that forwards a target on rather than resolving it,
 * this is the whole check; a hop that resolves one wants
 * {@link resolveUpstreamUrl}.
 */
export function isOriginFormTarget(requestTarget: string): boolean {
	if (!requestTarget.startsWith("/")) return false;
	if (requestTarget[1] === "/" || requestTarget[1] === "\\") return false;
	return !hasForbiddenCharacter(requestTarget);
}

/**
 * The URL to send `requestTarget` to, or null if it could reach any origin
 * other than `origin`.
 *
 * Callers must treat null as "refuse the request". Nothing is normalized or
 * repaired: a target that tried to move the origin is not a target with a
 * typo in it.
 */
export function resolveUpstreamUrl(
	origin: string,
	requestTarget: string,
): URL | null {
	let base: URL;
	try {
		base = new URL(origin);
	} catch {
		return null;
	}
	if (!isOriginFormTarget(requestTarget)) return null;

	let upstream: URL;
	try {
		upstream = new URL(requestTarget, base);
	} catch {
		return null;
	}
	// The checks above are what makes the refusal legible; this is what makes
	// it correct, and stays correct if URL parsing grows a new corner.
	if (upstream.origin !== base.origin) return null;
	if (upstream.username !== "" || upstream.password !== "") return null;
	return upstream;
}
