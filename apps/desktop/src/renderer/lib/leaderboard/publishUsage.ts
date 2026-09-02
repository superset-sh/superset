import type { RouterInputs } from "@superset/trpc";
import { PUBLISH_PAYLOAD_VERSION } from "@superset/trpc/leaderboard-schema";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const BACKFILL_DAYS = 30;

export const PREVIEW_DAYS = 30;

type PublishInput = RouterInputs["leaderboard"]["publish"];

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

export async function publishPayload(
	machineId: string,
	payload: LeaderboardPayload,
): Promise<{ written: number; days: number }> {
	if (payload.days.length === 0 && payload.factoryDays.length === 0) {
		return { written: 0, days: 0 };
	}

	return await apiTrpcClient.leaderboard.publish.mutate({
		payloadVersion: PUBLISH_PAYLOAD_VERSION,
		hostId: machineId,
		days: payload.days,
		factoryDays: payload.factoryDays,
	});
}

export async function publishUsage(
	hostUrl: string,
	machineId: string,
	days: number = BACKFILL_DAYS,
): Promise<{ written: number; days: number }> {
	return await publishPayload(machineId, await buildPayload(hostUrl, days));
}
