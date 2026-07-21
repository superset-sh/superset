import { parseHostRoutingKey } from "@superset/shared/host-routing";
import { LRUCache } from "lru-cache";
import { createApiClient } from "./api-client";
import type { AuthContext } from "./auth";

const ALLOWED_TTL_MS = 15 * 60 * 1000;
const DENIED_TTL_MS = 30 * 1000;

// Cache by (userId, hostId), not (token, hostId). Tokens rotate on every JWT
// refresh while the underlying user→host authorization is stable, so a
// token-keyed cache effectively expires with each refresh and burns
// host.checkAccess calls on the API for no reason.
const allowedCache = new LRUCache<string, true>({
	max: 50_000,
	ttl: ALLOWED_TTL_MS,
});
const deniedCache = new LRUCache<string, true>({
	max: 10_000,
	ttl: DENIED_TTL_MS,
});

// Why access was denied. Surfaced to the host in the WS close reason so the
// opaque "Forbidden" becomes self-explaining. These are the user's own
// memberships, so nothing sensitive leaks.
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

export async function checkHostAccess(
	auth: AuthContext,
	token: string,
	hostId: string,
): Promise<AccessResult> {
	// Short-circuit "not in org" locally: the API does this same check from
	// the JWT before hitting the DB, so the round trip is wasted.
	const parsed = parseHostRoutingKey(hostId);
	if (!parsed) return { ok: false, reason: "invalid_host" };
	if (!auth.organizationIds.includes(parsed.organizationId)) {
		return { ok: false, reason: "not_in_org" };
	}

	const key = `${auth.sub}:${hostId}`;
	if (allowedCache.has(key)) return { ok: true };
	if (deniedCache.has(key)) return { ok: false, reason: "not_registered" };

	try {
		const client = createApiClient(token);
		const result = await client.host.checkAccess.query({ hostId });
		if (result.allowed) {
			allowedCache.set(key, true);
			return { ok: true };
		}
		deniedCache.set(key, true);
		return { ok: false, reason: "not_registered" };
	} catch {
		return { ok: false, reason: "error" };
	}
}
