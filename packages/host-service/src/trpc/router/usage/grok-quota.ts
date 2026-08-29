/** Grok Build's weekly SuperGrok quota, using the CLI's read-only OAuth login. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageAccount } from "./types";

const ENDPOINT =
	"https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
const FETCH_TIMEOUT_MS = 10_000;

interface GrokAuthEntry {
	key?: string;
	email?: string;
	expires_at?: string | number;
	subscription_tier?: string;
}

interface ProtoScan {
	fixed32: Array<{ path: number[]; value: number; order: number }>;
	varints: Array<{ path: number[]; value: number }>;
}

function expiryMs(value: string | number | undefined): number {
	if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric))
			return numeric < 1e12 ? numeric * 1000 : numeric;
		return Date.parse(value);
	}
	return Number.POSITIVE_INFINITY;
}

function readVarint(
	bytes: Uint8Array,
	cursor: { value: number },
): number | null {
	let value = 0;
	let shift = 0;
	while (cursor.value < bytes.length && shift < 53) {
		const byte = bytes[cursor.value++];
		if (byte === undefined) return null;
		value += (byte & 0x7f) * 2 ** shift;
		if ((byte & 0x80) === 0) return value;
		shift += 7;
	}
	return null;
}

function scanProto(
	bytes: Uint8Array,
	depth = 0,
	path: number[] = [],
	startOrder = 0,
): ProtoScan & { order: number } {
	const scan: ProtoScan & { order: number } = {
		fixed32: [],
		varints: [],
		order: startOrder,
	};
	const cursor = { value: 0 };
	while (cursor.value < bytes.length) {
		const fieldStart = cursor.value;
		const key = readVarint(bytes, cursor);
		if (!key) {
			cursor.value = fieldStart + 1;
			continue;
		}
		const field = Math.floor(key / 8);
		const wire = key & 7;
		const fieldPath = [...path, field];
		if (wire === 0) {
			const value = readVarint(bytes, cursor);
			if (value !== null) scan.varints.push({ path: fieldPath, value });
			else cursor.value = fieldStart + 1;
		} else if (wire === 1) {
			if (cursor.value + 8 > bytes.length) break;
			cursor.value += 8;
		} else if (wire === 2) {
			const length = readVarint(bytes, cursor);
			if (length === null || cursor.value + length > bytes.length) {
				cursor.value = fieldStart + 1;
				continue;
			}
			const end = cursor.value + length;
			if (depth < 4) {
				const nested = scanProto(
					bytes.subarray(cursor.value, end),
					depth + 1,
					fieldPath,
					scan.order,
				);
				scan.fixed32.push(...nested.fixed32);
				scan.varints.push(...nested.varints);
				scan.order = nested.order;
			}
			cursor.value = end;
		} else if (wire === 5) {
			if (cursor.value + 4 > bytes.length) break;
			const view = new DataView(
				bytes.buffer,
				bytes.byteOffset + cursor.value,
				4,
			);
			scan.fixed32.push({
				path: fieldPath,
				value: view.getFloat32(0, true),
				order: scan.order++,
			});
			cursor.value += 4;
		} else {
			cursor.value = fieldStart + 1;
		}
	}
	return scan;
}

function dataFrames(bytes: Uint8Array): Uint8Array[] {
	const frames: Uint8Array[] = [];
	let index = 0;
	while (index + 5 <= bytes.length) {
		const flags = bytes[index] ?? 0;
		const length =
			((bytes[index + 1] ?? 0) << 24) |
			((bytes[index + 2] ?? 0) << 16) |
			((bytes[index + 3] ?? 0) << 8) |
			(bytes[index + 4] ?? 0);
		const start = index + 5;
		const end = start + length;
		if (length < 0 || end > bytes.length) return [];
		if ((flags & 0x80) === 0) frames.push(bytes.subarray(start, end));
		index = end;
	}
	return frames;
}

export function parseGrokQuotaPayload(
	bytes: Uint8Array,
	now = new Date(),
): { usedPercent: number; resetsAt: Date | null } | null {
	const frames = dataFrames(bytes);
	const payloads = frames.length > 0 ? frames : [bytes];
	const combined: ProtoScan = { fixed32: [], varints: [] };
	for (const payload of payloads) {
		const scan = scanProto(payload);
		combined.fixed32.push(...scan.fixed32);
		combined.varints.push(...scan.varints);
	}
	const percent = combined.fixed32
		.filter(
			(entry) =>
				entry.path.at(-1) === 1 &&
				Number.isFinite(entry.value) &&
				entry.value >= 0 &&
				entry.value <= 100,
		)
		.sort(
			(a, b) => a.path.length - b.path.length || a.order - b.order,
		)[0]?.value;
	const resetCandidates = combined.varints
		.filter(
			(entry) =>
				entry.value >= 1_700_000_000 &&
				entry.value <= 2_100_000_000 &&
				entry.value * 1000 > now.getTime(),
		)
		.map((entry) => ({ ...entry, date: new Date(entry.value * 1000) }));
	const preferred = resetCandidates.find(
		(entry) => entry.path.join(".") === "1.5.1",
	);
	const resetsAt = preferred?.date ?? resetCandidates[0]?.date ?? null;
	if (percent === undefined) return null;
	return { usedPercent: Math.max(0, Math.min(100, percent)), resetsAt };
}

export async function fetchGrokAccounts(): Promise<UsageAccount[]> {
	const authPath = join(homedir(), ".grok", "auth.json");
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(authPath, "utf8"));
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
	const credential = Object.values(
		parsed as Record<string, GrokAuthEntry>,
	).find((entry) => entry?.key);
	if (!credential?.key) return [];
	const base = {
		agent: "grok" as const,
		accountKey: authPath,
		sourceLabel: "~/.grok",
		email: credential.email ?? null,
		plan: credential.subscription_tier ?? null,
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: false,
		fetchedAt: new Date(),
	};
	const expiresAt = expiryMs(credential.expires_at);
	if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
		return [
			{
				...base,
				status: "token_expired",
				statusDetail: "Grok sign-in expired — run `grok login`.",
				windows: [],
			},
		];
	}
	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${credential.key}`,
				Origin: "https://grok.com",
				Referer: "https://grok.com/?_s=usage",
				Accept: "*/*",
				"Content-Type": "application/grpc-web+proto",
				"x-grpc-web": "1",
				"x-user-agent": "connect-es/2.1.1",
			},
			body: new Uint8Array(5),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (response.status === 401 || response.status === 403) {
			return [
				{
					...base,
					status: "token_expired",
					statusDetail: "Grok sign-in expired — run `grok login`.",
					windows: [],
				},
			];
		}
		if (!response.ok)
			throw new Error(`Usage endpoint returned ${response.status}.`);
		const quota = parseGrokQuotaPayload(
			new Uint8Array(await response.arrayBuffer()),
		);
		if (!quota) throw new Error("No weekly quota data returned.");
		return [
			{
				...base,
				status: "ok",
				statusDetail: null,
				windows: [{ id: "weekly", label: "Weekly", ...quota }],
			},
		];
	} catch (error) {
		return [
			{
				...base,
				status: "unavailable",
				statusDetail:
					error instanceof Error ? error.message : "Failed to fetch usage.",
				windows: [],
			},
		];
	}
}
