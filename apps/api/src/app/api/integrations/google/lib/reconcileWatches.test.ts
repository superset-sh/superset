import { describe, expect, test } from "bun:test";
import type { SelectConnection } from "@superset/db/schema";
import { WATCH_RENEW_WINDOW_MS } from "@superset/trpc/integrations/google";
import { type GmailWatchDeps, reconcileGmailWatch } from "./reconcileWatches";

const NOW = Date.parse("2026-10-09T06:00:00Z");
const HOUR = 60 * 60 * 1000;
const RENEWED_EXPIRATION = NOW + 7 * 24 * HOUR;

function connection(
	gmail: { historyId?: string; watchExpiresAt?: number } | null,
	scopes: string[] | null = null,
): SelectConnection {
	return {
		id: "conn-1",
		scopes,
		state: gmail ? { provider: "google", gmail } : null,
	} as SelectConnection;
}

function harness() {
	const calls = {
		watched: [] as string[],
		patched: [] as unknown[],
		synced: [] as string[],
	};
	const deps: GmailWatchDeps = {
		topicName: "projects/p/topics/gmail",
		now: NOW,
		watch: async (connectionId) => {
			calls.watched.push(connectionId);
			return { historyId: "fresh", expiration: RENEWED_EXPIRATION };
		},
		patch: async (_connectionId, patch) => {
			calls.patched.push(patch);
		},
		sync: async (synced) => {
			calls.synced.push(synced.id);
			return { baseline: false, added: 3, recorded: 3, matched: 1 };
		},
	};
	return { calls, deps };
}

describe("reconcileGmailWatch", () => {
	test("leaves a watch with more than the renew window left", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({
				historyId: "1",
				watchExpiresAt: NOW + WATCH_RENEW_WINDOW_MS + HOUR,
			}),
			deps,
		);
		expect(outcome).toEqual({ status: "current" });
		expect(calls.watched).toEqual([]);
	});

	test("renews inside the window and keeps the history id", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({ historyId: "1", watchExpiresAt: NOW + 24 * HOUR }),
			deps,
		);
		expect(outcome).toEqual({ status: "watched" });
		expect(calls.patched).toEqual([
			{ watchExpiresAt: RENEWED_EXPIRATION, historyId: "1" },
		]);
		expect(calls.synced).toEqual([]);
	});

	test("watches a connection that never had a watch", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(connection(null), deps);
		expect(outcome).toEqual({ status: "watched" });
		expect(calls.patched).toEqual([
			{ watchExpiresAt: RENEWED_EXPIRATION, historyId: "fresh" },
		]);
		expect(calls.synced).toEqual([]);
	});

	test("re-watches a lapsed watch and catches up the missed mail", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({ historyId: "1", watchExpiresAt: NOW - 34 * HOUR }),
			deps,
		);
		expect(outcome).toEqual({
			status: "rewatched_after_lapse",
			catchUp: { baseline: false, added: 3, recorded: 3, matched: 1 },
		});
		expect(calls.patched).toEqual([
			{ watchExpiresAt: RENEWED_EXPIRATION, historyId: "1" },
		]);
		expect(calls.synced).toEqual(["conn-1"]);
	});

	test("reports a failed catch-up without losing the new watch", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection({ historyId: "1", watchExpiresAt: NOW - HOUR }),
			{
				...deps,
				sync: async () => {
					throw new Error("history walk failed");
				},
			},
		);
		expect(outcome).toMatchObject({
			status: "rewatched_after_lapse",
			catchUp: { error: "history walk failed" },
		});
		expect(calls.patched).toHaveLength(1);
	});

	test("skips a connection granted no Gmail read scope", async () => {
		const { calls, deps } = harness();
		const outcome = await reconcileGmailWatch(
			connection(null, [
				"openid",
				"https://www.googleapis.com/auth/calendar.readonly",
			]),
			deps,
		);
		expect(outcome).toEqual({ status: "no_gmail_scope" });
		expect(calls.watched).toEqual([]);
	});
});
