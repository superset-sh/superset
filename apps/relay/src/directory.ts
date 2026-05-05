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
	// Upstash auto-stringifies objects on write and auto-parses on read.
	await Promise.all([
		redis.hset(OWNER_KEY, { [hostId]: encodeOwner(region, machineId) }),
		redis.hset(META_KEY, { [hostId]: meta }),
		redis.zadd(TTL_KEY, { score: now + TTL_GRACE_MS, member: hostId }),
	]);
}

// Compare-and-delete: only remove the directory entry if the current owner
// matches the caller's identity. Prevents the case where machine A's stale
// pong-timeout unregister wipes a directory entry that has since been
// rewritten by machine B.
const UNREGISTER_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if current == ARGV[2] then
  redis.call('HDEL', KEYS[1], ARGV[1])
  redis.call('HDEL', KEYS[2], ARGV[1])
  redis.call('ZREM', KEYS[3], ARGV[1])
  return 1
end
return 0
`;

export async function unregister(
	hostId: string,
	region: string,
	machineId: string,
): Promise<void> {
	await redis.eval(
		UNREGISTER_SCRIPT,
		[OWNER_KEY, META_KEY, TTL_KEY],
		[hostId, encodeOwner(region, machineId)],
	);
}

export async function lookup(hostId: string): Promise<TunnelOwner | null> {
	const value = await redis.hget<string>(OWNER_KEY, hostId);
	if (!value) return null;
	return decodeOwner(value);
}

export async function heartbeat(hostId: string): Promise<void> {
	const now = Date.now();
	const existing = await redis.hget<TunnelMeta>(META_KEY, hostId);
	const meta: TunnelMeta = existing
		? { ...existing, lastPongAt: now }
		: { registeredAt: now, lastPongAt: now };
	await Promise.all([
		redis.hset(META_KEY, { [hostId]: meta }),
		redis.zadd(TTL_KEY, { score: now + TTL_GRACE_MS, member: hostId }),
	]);
}

// Atomic check-and-delete per stale member: re-checks the score inside the
// script so a heartbeat that races between zrange (read) and zrem (write)
// can't have its live tunnel evicted by a stale snapshot.
const SWEEP_SCRIPT = `
local now = tonumber(ARGV[1])
local stale = redis.call('ZRANGEBYSCORE', KEYS[3], 0, now)
local removed = 0
for _, member in ipairs(stale) do
  local score = redis.call('ZSCORE', KEYS[3], member)
  if score and tonumber(score) <= now then
    redis.call('HDEL', KEYS[1], member)
    redis.call('HDEL', KEYS[2], member)
    redis.call('ZREM', KEYS[3], member)
    removed = removed + 1
  end
end
return removed
`;

export async function sweepStale(): Promise<number> {
	const now = Date.now();
	const result = await redis.eval(
		SWEEP_SCRIPT,
		[OWNER_KEY, META_KEY, TTL_KEY],
		[String(now)],
	);
	return typeof result === "number" ? result : 0;
}

export async function getAllOwners(): Promise<
	{ hostId: string; owner: TunnelOwner; meta: TunnelMeta | null }[]
> {
	const [owners, metas] = await Promise.all([
		redis.hgetall<Record<string, string>>(OWNER_KEY),
		redis.hgetall<Record<string, TunnelMeta>>(META_KEY),
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
		result.push({ hostId, owner, meta: metas?.[hostId] ?? null });
	}
	return result;
}
