import { TRPCError } from "@trpc/server";

/**
 * Node and undici codes meaning the request never reached our cloud API:
 * the machine is offline, DNS is broken, a firewall dropped it, or something
 * between the user and us terminated TLS and presented a certificate we will
 * not trust. Every one of these describes the network the host is sitting on,
 * not our software.
 *
 * Deliberately absent: CERT_HAS_EXPIRED and CERT_NOT_YET_VALID. Interception
 * shows up as an untrusted issuer or the wrong hostname; an expired
 * certificate is at least as likely to be *ours*, and that has to keep
 * reporting. Also absent: anything without a code at all — see
 * `findUnreachableCause`.
 */
const UNREACHABLE_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"ERR_TLS_CERT_ALTNAME_INVALID",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"UNABLE_TO_GET_ISSUER_CERT",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
]);

// A transport failure arrives three levels deep — TRPCClientError("fetch
// failed") → TypeError("fetch failed") → the coded error — so a couple of
// spare links, and a bound in case a chain ever loops back on itself.
const MAX_CAUSE_DEPTH = 8;

/**
 * Walks the `cause` chain for a coded transport failure. Read structurally
 * rather than with `instanceof`: this error was built by a tRPC client on top
 * of undici, its links are not ours, and only the plain `code` string is a
 * contract worth matching. A link without a matching `code` is not a match —
 * which is what keeps a non-JSON response body (a `SyntaxError` carrying no
 * code) reporting as the 500 it should be.
 */
function findUnreachableCause(error: unknown): string | null {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
		if (typeof current !== "object" || current === null) return null;
		const link = current as {
			code?: unknown;
			message?: unknown;
			cause?: unknown;
		};
		if (typeof link.code === "string" && UNREACHABLE_CODES.has(link.code)) {
			return typeof link.message === "string" && link.message.length > 0
				? link.message
				: link.code;
		}
		current = link.cause;
	}
	return null;
}

/**
 * Rethrows a failed call to our cloud API as SERVICE_UNAVAILABLE when the
 * request never got there, so the Sentry middleware doesn't report the user's
 * wifi as a host-service bug. No-op for everything else: an application error
 * the cloud API returned, a response we could not parse, or any failure with
 * no transport code keeps reporting as a 500.
 */
export function rethrowCloudUnreachable(error: unknown): void {
	const message = findUnreachableCause(error);
	if (message === null) return;
	throw new TRPCError({
		code: "SERVICE_UNAVAILABLE",
		message: `Could not reach the Superset cloud API: ${message}`,
	});
}
