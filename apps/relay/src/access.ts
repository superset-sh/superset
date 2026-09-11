import { parseHostRoutingKey } from "@superset/shared/host-routing";
import { LRUCache } from "lru-cache";
import { getServerByName } from "partyserver";
import { createApiClient } from "./api-client";
import type { AuthContext } from "./auth";
import { readPlacement } from "./placement";
import type { RelayEnv } from "./types";

export const ALLOWED_TTL_MS = 15 * 60 * 1000;
export const DENIED_TTL_MS = 30 * 1000;

// Front cache by (userId, hostId), not (token, hostId): tokens rotate on every
// JWT refresh while the underlying user→host authorization is stable. This is
// per isolate; the durable copy lives in the host's tunnel object, so a miss
// here costs one object call, not one API call.
const allowedCache = new LRUCache<string, true>({
	max: 50_000,
	ttl: ALLOWED_TTL_MS,
});
const deniedCache = new LRUCache<string, true>({
	max: 10_000,
	ttl: DENIED_TTL_MS,
});

// Tokens the API mints for its own presence reads. The API already authorized
// the caller against the host membership table before minting, so re-asking
// it per host would be the API checking itself.
const SERVER_PRESENCE_SCOPES = new Set([
	"automation-presence",
	"host-presence",
]);

export function isServerPresenceScope(scope: string | undefined): boolean {
	return scope !== undefined && SERVER_PRESENCE_SCOPES.has(scope);
}

export type AccessDenial =
	| "invalid_host"
	| "not_in_org"
	| "not_registered"
	| "not_connected"
	| "error";

export type AccessResult = { ok: true } | { ok: false; reason: AccessDenial };

// Short, WS-close-safe (<123 bytes) explanations for each denial.
export function accessDenialMessage(reason: AccessDenial): string {
	switch (reason) {
		case "not_in_org":
			return "not a member of this org";
		case "not_registered":
			return "host not registered to this account - run `superset start` on it with this org";
		case "not_connected":
			return "host not connected";
		case "invalid_host":
			return "invalid host id";
		default:
			return "access check failed";
	}
}

function localChecks(auth: AuthContext, hostId: string): AccessResult | null {
	const parsed = parseHostRoutingKey(hostId);
	if (!parsed) return { ok: false, reason: "invalid_host" };
	if (!auth.organizationIds.includes(parsed.organizationId)) {
		return { ok: false, reason: "not_in_org" };
	}
	const key = `${auth.sub}:${hostId}`;
	if (allowedCache.has(key)) return { ok: true };
	if (deniedCache.has(key)) return { ok: false, reason: "not_registered" };
	return null;
}

function remember(auth: AuthContext, hostId: string, allowed: boolean): void {
	const key = `${auth.sub}:${hostId}`;
	if (allowed) allowedCache.set(key, true);
	else deniedCache.set(key, true);
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
 * The host's own connect. There may be no placement yet, and a host must not
 * be able to create one on the strength of a stale cache, so this asks the
 * API directly on a front-cache miss.
 */
export async function checkHostAccessForRegister(
	auth: AuthContext,
	token: string,
	hostId: string,
	apiUrl: string,
): Promise<AccessResult> {
	const local = localChecks(auth, hostId);
	if (local) return local;
	try {
		const allowed = await fetchHostAccess(token, hostId, apiUrl);
		remember(auth, hostId, allowed);
		return allowed ? { ok: true } : { ok: false, reason: "not_registered" };
	} catch {
		return { ok: false, reason: "error" };
	}
}

/**
 * A client reaching a host. The decision is cached in the host's tunnel
 * object, which every isolate and colo resolves to, so the API is asked once
 * per (user, host) per TTL rather than once per isolate. A host that has never
 * connected has no object and nothing to reach: it is "not connected" with no
 * access check at all.
 */
export async function checkHostAccess(
	env: RelayEnv,
	auth: AuthContext,
	token: string,
	hostId: string,
): Promise<AccessResult> {
	const local = localChecks(auth, hostId);
	if (local) return local;
	const placement = await readPlacement(env, hostId);
	if (!placement) return { ok: false, reason: "not_connected" };
	try {
		const stub = await getServerByName(env.HostTunnel, placement.name);
		const allowed = await stub.checkAccess({
			hostId,
			userId: auth.sub,
			token,
			apiUrl: env.NEXT_PUBLIC_API_URL,
		});
		remember(auth, hostId, allowed);
		return allowed ? { ok: true } : { ok: false, reason: "not_registered" };
	} catch {
		return { ok: false, reason: "error" };
	}
}
