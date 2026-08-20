import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import {
	findGoogleConnectionById,
	googleConfigOf,
	listCalendars,
	patchCalendarState,
	patchGmailState,
	removeCalendarState,
	stopChannel,
	WATCH_RENEW_WINDOW_MS,
	watchCalendar,
	watchMailbox,
} from "@superset/trpc/integrations/google";
import { env } from "@/env";
import { syncCalendar } from "./syncCalendar";

/** More calendars than this and the long tail is holiday feeds, not signal. */
const MAX_WATCHED_CALENDARS = 50;

export type ReconcileResult = {
	calendars: number;
	watched: number;
	baselined: number;
	gmailWatched: boolean;
	errors: string[];
};

/**
 * Brings one connection's watches up to date: a channel on every calendar
 * the account can see, a baseline sync token for each, the Gmail watch when
 * a topic is configured. Idempotent; the daily cron and the connect callback
 * both call it. Google renews nothing itself.
 */
export async function reconcileWatches(
	connectionId: string,
): Promise<ReconcileResult> {
	const connection = await findGoogleConnectionById(connectionId);
	const result: ReconcileResult = {
		calendars: 0,
		watched: 0,
		baselined: 0,
		gmailWatched: false,
		errors: [],
	};
	if (!connection || connection.disconnectedAt) return result;

	// Deterministic before the cap — primary first, then by id — so the
	// retained set is the same on every run rather than churning channels and
	// re-baselining calendars each time Google returns the list in a new order.
	const listed = (await listCalendars(connectionId))
		.filter((calendar) => !calendar.deleted)
		.sort((a, b) =>
			a.primary === b.primary ? a.id.localeCompare(b.id) : a.primary ? -1 : 1,
		);
	const calendars = listed.slice(0, MAX_WATCHED_CALENDARS);
	result.calendars = calendars.length;
	const known = googleConfigOf(connection.config).calendars ?? {};
	const now = Date.now();
	const address = `${env.NEXT_PUBLIC_API_URL}/api/integrations/google/calendar/push`;

	for (const calendar of calendars) {
		const state = known[calendar.id];
		try {
			if (!state?.syncToken) {
				// The baseline before the channel: a push that arrives for a
				// calendar with no token would otherwise be the first sync and
				// would record nothing.
				const fresh = await findGoogleConnectionById(connectionId);
				if (fresh) await syncCalendar(fresh, calendar.id);
				result.baselined += 1;
			}
			await patchCalendarState(connectionId, calendar.id, {
				summary: calendar.summary ?? undefined,
			});

			const expiresSoon =
				(state?.channelExpiresAt ?? 0) - now < WATCH_RENEW_WINDOW_MS;
			if (state?.channelId && !expiresSoon) continue;

			// Token first, watch second: Google's initial "sync" push can land
			// before `watch` returns, and the route needs the token to accept it.
			const channel = {
				id: randomUUID(),
				token: randomBytes(24).toString("hex"),
				address,
			};
			await patchCalendarState(connectionId, calendar.id, {
				channelId: channel.id,
				channelTokenHash: createHash("sha256")
					.update(channel.token)
					.digest("hex"),
			});
			let watched: Awaited<ReturnType<typeof watchCalendar>>;
			try {
				watched = await watchCalendar(connectionId, calendar.id, channel);
			} catch (error) {
				// The new channel never opened; put the previous one back so its
				// pushes keep being accepted until the next renewal succeeds.
				if (state?.channelId && state.channelTokenHash) {
					await patchCalendarState(connectionId, calendar.id, {
						channelId: state.channelId,
						channelTokenHash: state.channelTokenHash,
					});
				}
				throw error;
			}
			await patchCalendarState(connectionId, calendar.id, {
				resourceId: watched.resourceId,
				channelExpiresAt: watched.expiration,
			});
			result.watched += 1;

			if (state?.channelId && state.resourceId) {
				await stopChannel(connectionId, {
					id: state.channelId,
					resourceId: state.resourceId,
				}).catch(() => undefined);
			}
		} catch (error) {
			result.errors.push(
				`calendar ${calendar.id}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Calendars that left the account's list: stop their channels and forget
	// them, so a stale channel does not keep a dead sync token alive. Ones the
	// cap dropped are still on the account and keep their state.
	const current = new Set(listed.map((calendar) => calendar.id));
	for (const [calendarId, state] of Object.entries(known)) {
		if (current.has(calendarId)) continue;
		if (state.channelId && state.resourceId) {
			await stopChannel(connectionId, {
				id: state.channelId,
				resourceId: state.resourceId,
			}).catch(() => undefined);
		}
		await removeCalendarState(connectionId, calendarId);
	}

	if (env.GOOGLE_PUBSUB_TOPIC) {
		try {
			await reconcileGmailWatch(connection, env.GOOGLE_PUBSUB_TOPIC, now);
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
	connection: SelectIntegrationConnection,
	topicName: string,
	now: number,
): Promise<void> {
	const state = googleConfigOf(connection.config).gmail;
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
