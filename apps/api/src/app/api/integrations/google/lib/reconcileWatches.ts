import type { SelectConnection } from "@superset/db/schema";
import {
	findGoogleConnectionById,
	googleConfigOf,
	patchGmailState,
	WATCH_RENEW_WINDOW_MS,
	watchMailbox,
} from "@superset/trpc/integrations/google";
import { env } from "@/env";

export type ReconcileResult = {
	gmailWatched: boolean;
	errors: string[];
};

/**
 * Brings one connection's Gmail watch up to date when a topic is configured.
 * Idempotent; the daily cron and the connect callback both call it. Google
 * renews nothing itself.
 */
export async function reconcileWatches(
	connectionId: string,
): Promise<ReconcileResult> {
	const connection = await findGoogleConnectionById(connectionId);
	const result: ReconcileResult = { gmailWatched: false, errors: [] };
	if (!connection || connection.disconnectedAt) return result;

	if (env.GOOGLE_PUBSUB_TOPIC) {
		try {
			await reconcileGmailWatch(
				connection,
				env.GOOGLE_PUBSUB_TOPIC,
				Date.now(),
			);
			result.gmailWatched = true;
		} catch (error) {
			result.errors.push(
				`gmail: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return result;
}

async function reconcileGmailWatch(
	connection: SelectConnection,
	topicName: string,
	now: number,
): Promise<void> {
	const state = googleConfigOf(connection.state).gmail;
	const expiresSoon =
		(state?.watchExpiresAt ?? 0) - now < WATCH_RENEW_WINDOW_MS;
	if (!expiresSoon) return;
	const watched = await watchMailbox(connection.id, topicName);
	await patchGmailState(connection.id, {
		watchExpiresAt: watched.expiration,
		// Continue from where we were; only a first watch starts from now.
		historyId: state?.historyId ?? watched.historyId,
	});
}
