import { db } from "@superset/db/client";
import {
	connections,
	type GoogleConfig,
	type SelectConnection,
} from "@superset/db/schema";
import { eq, sql } from "drizzle-orm";
import { connectionById, userConnection } from "../../../lib/connectors";

/**
 * The per-connection sync state lives in `connections.state`, plaintext beside
 * the encrypted `config`. Writes are a jsonb merge in SQL rather than a
 * read-modify-write in JavaScript, so a concurrent write cannot undo another.
 */

export function googleConfigOf(state: unknown): GoogleConfig {
	if (state && typeof state === "object" && "provider" in state) {
		const candidate = state as { provider?: string };
		if (candidate.provider === "google") return state as GoogleConfig;
	}
	return { provider: "google" };
}

/**
 * One member's active Google connection in an org, or null. Per user, not per
 * org: a mailbox is personal, and each member connects their own.
 */
export async function findGoogleConnection(
	organizationId: string,
	userId: string,
): Promise<SelectConnection | null> {
	return userConnection(organizationId, "google", userId);
}

export async function findGoogleConnectionById(
	connectionId: string,
): Promise<SelectConnection | null> {
	return connectionById(connectionId, {
		connector: "google",
		includeDisconnected: true,
	});
}

export async function patchGmailState(
	connectionId: string,
	patch: NonNullable<GoogleConfig["gmail"]>,
): Promise<void> {
	const json = JSON.stringify(patch);
	await db
		.update(connections)
		.set({
			state: sql`jsonb_set(
				coalesce(${connections.state}, '{}'::jsonb) || '{"provider":"google"}'::jsonb,
				'{gmail}',
				coalesce(${connections.state} -> 'gmail', '{}'::jsonb) || ${json}::jsonb
			)`,
		})
		.where(eq(connections.id, connectionId));
}
