#!/usr/bin/env bun
/**
 * Print a health snapshot of every relay machine + the Upstash tunnel directory.
 *
 * Reads from env (or .env via --env-file):
 *   FLY_API_TOKEN        deploy/admin token for the relay app
 *   RELAY_FLY_APP        defaults to "superset-relay"
 *   RELAY_ADMIN_SECRET   bearer for each machine's /admin/tunnels
 *   KV_REST_API_URL      Upstash REST URL (same instance the relay writes to)
 *   KV_REST_API_TOKEN    Upstash REST token
 *
 * Usage:
 *   bun run apps/relay/scripts/relay-status.ts
 *   bun run --env-file=.env apps/relay/scripts/relay-status.ts
 */

import { Redis } from "@upstash/redis";

const FLY_API = "https://api.machines.dev/v1";
const APP = process.env.RELAY_FLY_APP ?? "superset-relay";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) die(`${name} is required`);
	return value;
}

const FLY_TOKEN = requireEnv("FLY_API_TOKEN");
const ADMIN_SECRET = requireEnv("RELAY_ADMIN_SECRET");
const KV_URL = requireEnv("KV_REST_API_URL");
const KV_TOKEN = requireEnv("KV_REST_API_TOKEN");

interface FlyMachine {
	id: string;
	name: string;
	region: string;
	state: string;
	updated_at: string;
	private_ip: string;
}

interface MachineTunnels {
	region: string;
	machineId: string;
	tunnels: { hostId: string; registeredAt: number }[];
	flaps: { hostId: string; lifetimeMs: number }[];
}

const machines = await fetchMachines();
const tunnelInfos = await Promise.all(machines.map(probeMachine));
const directoryOwners = await fetchDirectory();

const byRegion = new Map<
	string,
	{ machines: FlyMachine[]; tunnels: MachineTunnels[]; directoryCount: number }
>();
for (const m of machines) {
	if (!byRegion.has(m.region)) {
		byRegion.set(m.region, { machines: [], tunnels: [], directoryCount: 0 });
	}
	byRegion.get(m.region)?.machines.push(m);
}
for (const t of tunnelInfos) {
	if (!t) continue;
	byRegion.get(t.region)?.tunnels.push(t);
}
for (const owner of directoryOwners) {
	const slot = byRegion.get(owner.region);
	if (slot) slot.directoryCount++;
}

console.log(`\nrelay status — app=${APP}\n`);
const rows: string[][] = [
	[
		"region",
		"machines",
		"tunnels (live)",
		"tunnels (directory)",
		"recent flaps",
	],
];
for (const [region, slot] of [...byRegion.entries()].sort()) {
	const states = slot.machines.map((m) => `${m.id.slice(0, 6)}:${m.state}`);
	const live = slot.tunnels.reduce((n, t) => n + t.tunnels.length, 0);
	const flaps = slot.tunnels.reduce((n, t) => n + t.flaps.length, 0);
	rows.push([
		region,
		`${slot.machines.length} (${states.join(", ")})`,
		String(live),
		String(slot.directoryCount),
		String(flaps),
	]);
}
printTable(rows);

const orphans = directoryOwners.filter(
	(o) => !machines.some((m) => m.id === o.machineId),
);
if (orphans.length > 0) {
	console.log(
		`\n  ! ${orphans.length} directory entries point to machine IDs not currently running:`,
	);
	for (const o of orphans.slice(0, 10)) {
		console.log(`    ${o.hostId}  →  ${o.region}:${o.machineId}`);
	}
	if (orphans.length > 10) console.log(`    … and ${orphans.length - 10} more`);
}

console.log("");

async function fetchMachines(): Promise<FlyMachine[]> {
	const res = await fetch(`${FLY_API}/apps/${APP}/machines`, {
		headers: { Authorization: `Bearer ${FLY_TOKEN}` },
	});
	if (!res.ok) die(`fly machines API: ${res.status} ${await res.text()}`);
	return (await res.json()) as FlyMachine[];
}

async function probeMachine(m: FlyMachine): Promise<MachineTunnels | null> {
	if (m.state !== "started") return null;
	// flycast resolves <machine-id>.vm.<app>.internal — but that's only reachable
	// from inside the fly network. From outside we hit the public hostname with a
	// fly-prefer-instance header so the LB pins us to this machine.
	const url = `https://${APP}.fly.dev/admin/tunnels`;
	try {
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${ADMIN_SECRET}`,
				"fly-prefer-instance-id": m.id,
			},
		});
		if (!res.ok) return null;
		return (await res.json()) as MachineTunnels;
	} catch {
		return null;
	}
}

async function fetchDirectory(): Promise<
	{ hostId: string; region: string; machineId: string }[]
> {
	const redis = new Redis({ url: KV_URL, token: KV_TOKEN });
	const owners =
		await redis.hgetall<Record<string, string>>("relay:tunnel-owner");
	if (!owners) return [];
	const out: { hostId: string; region: string; machineId: string }[] = [];
	for (const [hostId, value] of Object.entries(owners)) {
		const idx = value.indexOf(":");
		if (idx <= 0) continue;
		out.push({
			hostId,
			region: value.slice(0, idx),
			machineId: value.slice(idx + 1),
		});
	}
	return out;
}

function printTable(rows: string[][]): void {
	const widths = rows[0].map((_, col) =>
		Math.max(...rows.map((r) => r[col]?.length ?? 0)),
	);
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		const line = r.map((cell, j) => cell.padEnd(widths[j])).join("  ");
		console.log(`  ${line}`);
		if (i === 0)
			console.log(`  ${widths.map((w) => "─".repeat(w)).join("  ")}`);
	}
}

function die(msg: string): never {
	console.error(`relay-status: ${msg}`);
	process.exit(1);
}
