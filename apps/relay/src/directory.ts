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
	readYourWrites: false,
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

// Atomic three-write register. If a partial Promise.all failure left
// OWNER/META set but TTL absent, sweepStale could never reclaim it. Lua
// gives us all-or-nothing.
const REGISTER_SCRIPT = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
redis.call('ZADD', KEYS[3], ARGV[4], ARGV[1])
return 1
`;

export async function register(
	hostId: string,
	region: string,
	machineId: string,
): Promise<void> {
	const now = Date.now();
	const meta: TunnelMeta = { registeredAt: now, lastPongAt: now };
	await redis.eval(
		REGISTER_SCRIPT,
		[OWNER_KEY, META_KEY, TTL_KEY],
		[
			hostId,
			encodeOwner(region, machineId),
			JSON.stringify(meta),
			String(now + TTL_GRACE_MS),
		],
	);
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
	// Skip refresh if OWNER was already torn down — prevents META/TTL
	// resurrection after a concurrent unregister/sweep. There's a residual
	// race between this check and the writes below, but the worst case is
	// ~90s of zombie META/TTL until sweepStale reclaims it.
	if (!(await redis.hexists(OWNER_KEY, hostId))) return;
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

// Called on relay startup. Removes any directory entries the prior process
// generation left behind (SIGKILL / crash / drain race) before we begin
// accepting connections. The owner value includes the Fly machineId, which
// stays the same across restarts of a given VM — so any pre-existing entry
// with our owner string is necessarily stale.
//
// Batched as a single Lua eval so startup time stays bounded at one Redis
// round-trip regardless of how many tunnels the previous generation owned;
// per-host serial unregister calls would scale with directory size and eat
// directly into deploy recovery.
const CLEAR_STALE_SCRIPT = `
local owner = ARGV[1]
local entries = redis.call('HGETALL', KEYS[1])
local cleared = 0
for i = 1, #entries, 2 do
  local hostId = entries[i]
  local current = entries[i + 1]
  if current == owner then
    redis.call('HDEL', KEYS[1], hostId)
    redis.call('HDEL', KEYS[2], hostId)
    redis.call('ZREM', KEYS[3], hostId)
    cleared = cleared + 1
  end
end
return cleared
`;

export async function clearStaleEntriesForMachine(
	region: string,
	machineId: string,
): Promise<number> {
	const myOwner = encodeOwner(region, machineId);
	const result = await redis.eval(
		CLEAR_STALE_SCRIPT,
		[OWNER_KEY, META_KEY, TTL_KEY],
		[myOwner],
	);
	return typeof result === "number" ? result : 0;
}

export async function sweepStale(): Promise<number> {
	const now = Date.now();
	const result = await redis.eval(
		SWEEP_SCRIPT,
		[OWNER_KEY, META_KEY, TTL_KEY],
		[String(now)],
	);
	return typeof result === "number" ? result : 0;
}
