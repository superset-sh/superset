import { parseHostRoutingKey } from "@superset/shared/host-routing";
import type { AuthContext } from "@superset/shared/verify-jwt";
import { createApiClient } from "./api-client";

export const ALLOWED_TTL_MS = 15 * 60 * 1000;
export const DENIED_TTL_MS = 30 * 1000;

// The API mints this for its own presence reads and has already authorized
// the caller against the host membership table, so re-asking it per host
// would be the API checking itself.
export function isServerPresenceScope(scope: string | undefined): boolean {
	return scope === "automation-presence";
}

/** Who is asking, as the host's object needs it to authorize a call. */
export interface Caller {
	userId: string;
	token: string;
}

export function callerOf(auth: AuthContext, token: string): Caller {
	return { userId: auth.sub, token };
}

export type AccessDenial =
	| "invalid_host"
	| "not_in_org"
	| "not_registered"
	| "error";

export type AccessResult = { ok: true } | { ok: false; reason: AccessDenial };

// Short, WS-close-safe (<123 bytes) explanations for each denial.
export function accessDenialMessage(reason: AccessDenial): string {
	switch (reason) {
		case "not_in_org":
			return "not a member of this org";
		case "not_registered":
			return "host not registered to this account - run `superset start` on it with this org";
		case "invalid_host":
			return "invalid host id";
		default:
			return "access check failed";
	}
}

/** What the Worker can decide from the token alone: a well-formed host id in one of the caller's organizations. */
export function checkOrgAccess(
	auth: AuthContext,
	hostId: string,
): AccessResult {
	const parsed = parseHostRoutingKey(hostId);
	if (!parsed) return { ok: false, reason: "invalid_host" };
	if (!auth.organizationIds.includes(parsed.organizationId)) {
		return { ok: false, reason: "not_in_org" };
	}
	return { ok: true };
}

export async function fetchHostAccess(
	token: string,
	hostId: string,
	apiUrl: string,
): Promise<boolean> {
	const client = createApiClient(token, apiUrl);
	const result = await client.host.checkAccess.query({ hostId });
	return result.allowed;
}

/**
 * The host's own connect. Its object may not exist yet, and a host must not
 * be able to create its placement on the strength of a cache, so this asks
 * the API every time; a control connect is rare next to client traffic.
 */
export async function checkHostAccessForRegister(
	auth: AuthContext,
	token: string,
	hostId: string,
	apiUrl: string,
): Promise<AccessResult> {
	const org = checkOrgAccess(auth, hostId);
	if (!org.ok) return org;
	try {
		const allowed = await fetchHostAccess(token, hostId, apiUrl);
		return allowed ? { ok: true } : { ok: false, reason: "not_registered" };
	} catch {
		return { ok: false, reason: "error" };
	}
}
