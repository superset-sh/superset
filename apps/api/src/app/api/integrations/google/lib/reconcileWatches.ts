import type { SelectConnection } from "@superset/db/schema";
import {
	canReadGmail,
	findGoogleConnectionById,
	googleConfigOf,
	patchGmailState,
	WATCH_RENEW_WINDOW_MS,
	watchMailbox,
} from "@superset/trpc/integrations/google";
import { type MailboxSyncResult, syncMailbox } from "./syncMailbox";

export type GmailWatchOutcome =
	| { status: "current" | "no_gmail_scope" | "watched" }
	| {
			status: "rewatched_after_lapse";
			catchUp: MailboxSyncResult | { error: string };
	  };

export type ReconcileResult = {
	gmail: GmailWatchOutcome | null;
	errors: string[];
};

export type GmailWatchDeps = {
	topicName: string;
	now: number;
	watch?: typeof watchMailbox;
	patch?: typeof patchGmailState;
	sync?: typeof syncMailbox;
};

/**
 * Brings one connection's Gmail watch up to date. Idempotent; the cron and
 * both connect callbacks call it. Google renews nothing itself.
 */
export async function reconcileWatches(
	connectionId: string,
	topicName: string,
): Promise<ReconcileResult> {
	const connection = await findGoogleConnectionById(connectionId);
	const result: ReconcileResult = { gmail: null, errors: [] };
	if (!connection || connection.disconnectedAt) return result;

	try {
		result.gmail = await reconcileGmailWatch(connection, {
			topicName,
			now: Date.now(),
		});
		if (
			result.gmail.status === "rewatched_after_lapse" &&
			"error" in result.gmail.catchUp
		) {
			result.errors.push(`gmail catch-up: ${result.gmail.catchUp.error}`);
		}
	} catch (error) {
		result.errors.push(
			`gmail: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return result;
}

export async function reconcileGmailWatch(
	connection: SelectConnection,
	{
		topicName,
		now,
		watch = watchMailbox,
		patch = patchGmailState,
		sync = syncMailbox,
	}: GmailWatchDeps,
): Promise<GmailWatchOutcome> {
	if (!canReadGmail(connection.scopes)) return { status: "no_gmail_scope" };

	const state = googleConfigOf(connection.state).gmail;
	const expiresAt = state?.watchExpiresAt;
	if (expiresAt !== undefined && expiresAt - now >= WATCH_RENEW_WINDOW_MS) {
		return { status: "current" };
	}

	const watched = await watch(connection.id, topicName);
	await patch(connection.id, {
		watchExpiresAt: watched.expiration,
		// Continue from where we were; only a first watch starts from now.
		historyId: state?.historyId ?? watched.historyId,
	});
	if (expiresAt === undefined || expiresAt > now) return { status: "watched" };

	// Nothing pushed while the watch was dead; record that mail now.
	const catchUp = await sync(connection).catch((error: unknown) => ({
		error: error instanceof Error ? error.message : String(error),
	}));
	return { status: "rewatched_after_lapse", catchUp };
}
