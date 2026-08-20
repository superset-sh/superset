import { db } from "@superset/db/client";
import {
	type GoogleCalendarWatchState,
	type GoogleConfig,
	integrationConnections,
} from "@superset/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * The per-connection sync state lives in `integration_connections.config`.
 * Every write here is a jsonb merge in SQL rather than a read-modify-write in
 * JavaScript, because two calendars on one connection can be syncing at once
 * and the second write must not undo the first.
 */

export function googleConfigOf(config: unknown): GoogleConfig {
	if (config && typeof config === "object" && "provider" in config) {
		const candidate = config as { provider?: string };
		if (candidate.provider === "google") return config as GoogleConfig;
	}
	return { provider: "google" };
}

/**
 * One member's active Google connection in an org, or null. Per user, not per
 * org: Calendar and Gmail are personal, and each member connects their own.
 */
export async function findGoogleConnection(
	organizationId: string,
	userId: string,
) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "google"),
			eq(integrationConnections.connectedByUserId, userId),
			isNull(integrationConnections.disconnectedAt),
		),
	});
	return connection ?? null;
}

export async function findGoogleConnectionById(connectionId: string) {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.id, connectionId),
			eq(integrationConnections.provider, "google"),
		),
	});
	return connection ?? null;
}

/** Merges `patch` into `config.calendars[calendarId]`, creating as needed. */
export async function patchCalendarState(
	connectionId: string,
	calendarId: string,
	patch: Partial<GoogleCalendarWatchState>,
): Promise<void> {
	const json = JSON.stringify(patch);
	await db
		.update(integrationConnections)
		.set({
			config: sql`jsonb_set(
				jsonb_set(
					coalesce(${integrationConnections.config}, '{}'::jsonb) || '{"provider":"google"}'::jsonb,
					'{calendars}',
					coalesce(${integrationConnections.config} -> 'calendars', '{}'::jsonb)
				),
				ARRAY['calendars', ${calendarId}]::text[],
				coalesce(${integrationConnections.config} #> ARRAY['calendars', ${calendarId}]::text[], '{}'::jsonb) || ${json}::jsonb
			)`,
		})
		.where(eq(integrationConnections.id, connectionId));
}

export async function removeCalendarState(
	connectionId: string,
	calendarId: string,
): Promise<void> {
	await db
		.update(integrationConnections)
		.set({
			config: sql`${integrationConnections.config} #- ARRAY['calendars', ${calendarId}]::text[]`,
		})
		.where(eq(integrationConnections.id, connectionId));
}

export async function patchGmailState(
	connectionId: string,
	patch: NonNullable<GoogleConfig["gmail"]>,
): Promise<void> {
	const json = JSON.stringify(patch);
	await db
		.update(integrationConnections)
		.set({
			config: sql`jsonb_set(
				coalesce(${integrationConnections.config}, '{}'::jsonb) || '{"provider":"google"}'::jsonb,
				'{gmail}',
				coalesce(${integrationConnections.config} -> 'gmail', '{}'::jsonb) || ${json}::jsonb
			)`,
		})
		.where(eq(integrationConnections.id, connectionId));
}
