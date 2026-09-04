import type { RelayEnv } from "./types";

// A Durable Object lives wherever the request that first creates it came
// from, and never moves. Before this directory that was often the API's
// presence lookup from the US, which pinned European and Asian hosts to a US
// object for good. Now only the host's own control connect creates an object,
// so it lands at the host's ingress; every other route resolves through this
// record and treats a host without one as offline.

export interface Placement {
	/** Durable Object name: `<hostId>#<generation>`. */
	name: string;
	generation: number;
	/** Host's continent at creation; a move to another continent re-places. */
	continent: string;
	colo: string;
}

const KEY_PREFIX = "placement:";
// Per-isolate memo on top of KV's own edge cache; a change made at another
// edge is visible within KV's propagation window plus this.
const CACHE_TTL_MS = 30_000;
const cache = new Map<
	string,
	{ placement: Placement | null; expiresAt: number }
>();

function key(hostId: string): string {
	return `${KEY_PREFIX}${hostId}`;
}

export async function readPlacement(
	env: RelayEnv,
	hostId: string,
): Promise<Placement | null> {
	const cached = cache.get(hostId);
	if (cached && cached.expiresAt > Date.now()) return cached.placement;
	const placement = await env.PLACEMENT.get<Placement>(key(hostId), "json");
	cache.set(hostId, { placement, expiresAt: Date.now() + CACHE_TTL_MS });
	return placement;
}

/**
 * Host connect: keep the record while the host is still on the same
 * continent, otherwise mint the next generation so the object is re-created
 * where this request came in. Reads KV directly: the memo may lag a write.
 */
export async function placeHost(
	env: RelayEnv,
	hostId: string,
	cf: Pick<IncomingRequestCfProperties, "continent" | "colo"> | undefined,
): Promise<Placement> {
	const continent = cf?.continent ?? "unknown";
	const colo = cf?.colo ?? "unknown";
	const current = await env.PLACEMENT.get<Placement>(key(hostId), "json");
	if (current && current.continent === continent) {
		cache.set(hostId, {
			placement: current,
			expiresAt: Date.now() + CACHE_TTL_MS,
		});
		return current;
	}
	const generation = (current?.generation ?? 0) + 1;
	const placement: Placement = {
		name: `${hostId}#${generation}`,
		generation,
		continent,
		colo,
	};
	await env.PLACEMENT.put(key(hostId), JSON.stringify(placement));
	cache.set(hostId, { placement, expiresAt: Date.now() + CACHE_TTL_MS });
	console.log(
		`[relay] placed host ${hostId} generation ${generation} at ${colo} (${continent})${current ? ` replacing ${current.colo}` : ""}`,
	);
	return placement;
}
