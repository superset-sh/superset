import { Redis } from "@upstash/redis";
import { env } from "./env";

const KEY_PREFIX = "relay:";
const OWNER_KEY = `${KEY_PREFIX}tunnel-owner`;
const META_KEY = `${KEY_PREFIX}tunnel-meta`;
const TTL_KEY = `${KEY_PREFIX}tunnel-ttl`;

const TTL_GRACE_MS = 90_000;

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

export interface TunnelOwner {
	region: string;
	machineId: string;
}

export interface TunnelMeta {
	registeredAt: number;
	lastPongAt: number;
}

function encodeOwner(region: string, machineId: string): string {
	return `${region}:${machineId}`;
}

function decodeOwner(value: string): TunnelOwner | null {
	const idx = value.indexOf(":");
	if (idx <= 0) return null;
	return { region: value.slice(0, idx), machineId: value.slice(idx + 1) };
}

export async function register(
	hostId: string,
	region: string,
	machineId: string,
): Promise<void> {
	const now = Date.now();
	const meta: TunnelMeta = { registeredAt: now, lastPongAt: now };
	await Promise.all([
		redis.hset(OWNER_KEY, { [hostId]: encodeOwner(region, machineId) }),
		redis.hset(META_KEY, { [hostId]: JSON.stringify(meta) }),
		redis.zadd(TTL_KEY, { score: now + TTL_GRACE_MS, member: hostId }),
	]);
}

export async function unregister(hostId: string): Promise<void> {
	await Promise.all([
		redis.hdel(OWNER_KEY, hostId),
		redis.hdel(META_KEY, hostId),
		redis.zrem(TTL_KEY, hostId),
	]);
}

export async function lookup(hostId: string): Promise<TunnelOwner | null> {
	const value = await redis.hget<string>(OWNER_KEY, hostId);
	if (!value) return null;
	return decodeOwner(value);
}

export async function heartbeat(hostId: string): Promise<void> {
	const now = Date.now();
	const existing = await redis.hget<string>(META_KEY, hostId);
	const meta: TunnelMeta = existing
		? { ...(JSON.parse(existing) as TunnelMeta), lastPongAt: now }
		: { registeredAt: now, lastPongAt: now };
	await Promise.all([
		redis.hset(META_KEY, { [hostId]: JSON.stringify(meta) }),
		redis.zadd(TTL_KEY, { score: now + TTL_GRACE_MS, member: hostId }),
	]);
}

export async function sweepStale(): Promise<number> {
	const now = Date.now();
	const stale = await redis.zrange<string[]>(TTL_KEY, 0, now, {
		byScore: true,
	});
	if (stale.length === 0) return 0;
	await Promise.all([
		redis.hdel(OWNER_KEY, ...stale),
		redis.hdel(META_KEY, ...stale),
		redis.zrem(TTL_KEY, ...stale),
	]);
	return stale.length;
}

export async function getAllOwners(): Promise<
	{ hostId: string; owner: TunnelOwner; meta: TunnelMeta | null }[]
> {
	const [owners, metas] = await Promise.all([
		redis.hgetall<Record<string, string>>(OWNER_KEY),
		redis.hgetall<Record<string, string>>(META_KEY),
	]);
	if (!owners) return [];
	const result: {
		hostId: string;
		owner: TunnelOwner;
		meta: TunnelMeta | null;
	}[] = [];
	for (const [hostId, value] of Object.entries(owners)) {
		const owner = decodeOwner(value);
		if (!owner) continue;
		const metaRaw = metas?.[hostId];
		const meta = metaRaw ? (JSON.parse(metaRaw) as TunnelMeta) : null;
		result.push({ hostId, owner, meta });
	}
	return result;
}
