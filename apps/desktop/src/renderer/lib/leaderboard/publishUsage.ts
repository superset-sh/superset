import type { RouterInputs, RouterOutputs } from "@superset/trpc";
import {
	daysSinceLaunch,
	MAX_BACKFILL_DAYS,
} from "@superset/trpc/leaderboard-periods";
import {
	PUBLISH_MAX_DAYS,
	PUBLISH_PAYLOAD_VERSION,
} from "@superset/trpc/leaderboard-schema";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const BACKFILL_DAYS = 30;

export const PREVIEW_DAYS = 30;

export type BackfillRange = "recent" | "launch";

export function backfillDays(
	range: BackfillRange,
	now: Date = new Date(),
): number {
	if (range !== "launch") return BACKFILL_DAYS;
	return Math.min(daysSinceLaunch(now), MAX_BACKFILL_DAYS);
}

type PublishInput = RouterInputs["leaderboard"]["publish"];
type PublishResult = RouterOutputs["leaderboard"]["publish"];

export type Awarded = PublishResult["awarded"];

export type LeaderboardPayloadDay = PublishInput["days"][number];
export type LeaderboardFactoryDay = NonNullable<
	PublishInput["factoryDays"]
>[number];

export interface LeaderboardPayload {
	days: LeaderboardPayloadDay[];
	factoryDays: LeaderboardFactoryDay[];
}

export async function buildPayload(
	hostUrl: string,
	days: number,
): Promise<LeaderboardPayload> {
	return await getHostServiceClientByUrl(
		hostUrl,
	).usage.leaderboardPayload.query({ days });
}

function groupConsecutiveDays<T extends { day: string }>(
	rows: readonly T[],
): T[][] {
	const groups: T[][] = [];
	for (const row of rows) {
		const last = groups.at(-1);
		if (last?.[0]?.day === row.day) last.push(row);
		else groups.push([row]);
	}
	return groups;
}

export function chunkRows<T extends { day: string }>(
	rows: readonly T[],
	maxRows: number,
): T[][] {
	const chunks: T[][] = [];
	let current: T[] = [];

	for (const group of groupConsecutiveDays(rows)) {
		if (current.length > 0 && current.length + group.length > maxRows) {
			chunks.push(current);
			current = [];
		}
		for (const row of group) {
			if (current.length === maxRows) {
				chunks.push(current);
				current = [];
			}
			current.push(row);
		}
	}
	if (current.length > 0) chunks.push(current);

	return chunks;
}

export async function publishPayload(
	machineId: string,
	payload: LeaderboardPayload,
): Promise<PublishResult> {
	const dayBatches = chunkRows(payload.days, PUBLISH_MAX_DAYS);
	const factoryBatches = chunkRows(payload.factoryDays, PUBLISH_MAX_DAYS);
	const batches = Math.max(dayBatches.length, factoryBatches.length);

	let written = 0;
	const awarded: Awarded = [];
	for (let batch = 0; batch < batches; batch++) {
		const result = await apiTrpcClient.leaderboard.publish.mutate({
			payloadVersion: PUBLISH_PAYLOAD_VERSION,
			hostId: machineId,
			days: dayBatches[batch] ?? [],
			factoryDays: factoryBatches[batch] ?? [],
		});
		written += result.written;
		awarded.push(...result.awarded);
	}

	const days = new Set([
		...payload.days.map((day) => day.day),
		...payload.factoryDays.map((day) => day.day),
	]).size;

	return { written, days, awarded };
}

export async function publishUsage(
	hostUrl: string,
	machineId: string,
	days: number = BACKFILL_DAYS,
): Promise<PublishResult> {
	return await publishPayload(machineId, await buildPayload(hostUrl, days));
}
