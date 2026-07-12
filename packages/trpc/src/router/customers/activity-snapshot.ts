import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { CORE_ACTIVITY_EVENTS } from "@superset/shared/customer-health";

import { executeHogQLQuery } from "../../lib/posthog-client";

/**
 * Per-user activity aggregates computed from a single global HogQL query over
 * the curated core activity events. Underlying PostHog result is cached for
 * 1h by posthog-client; on top of that we memoize the parsed structures
 * in-process so concurrent requests share one in-flight fetch.
 */

export interface UserActivity {
	lastActiveAt: Date;
	events7d: number;
	events30d: number;
	events30dPrev: number;
	activeDays30: number;
	desktopEvents: number;
	cliEvents: number;
	chatEvents: number;
}

export interface ActivitySnapshot {
	fetchedAt: Date;
	byUserId: Map<string, UserActivity>;
}

export interface OrgActivity {
	memberCount: number;
	lastActiveAt: Date | null;
	events30d: number;
	events30dPrev: number;
	activeMembers7d: number;
}

export interface OrgActivityIndex {
	fetchedAt: Date;
	byOrgId: Map<string, OrgActivity>;
}

/**
 * Just under the HogQL API's 65535-row cap; measured 90d volume is ~56k ids.
 * Result rows are ordered by last activity, so if the LIMIT ever truncates,
 * only the longest-dormant users are dropped.
 */
const SNAPSHOT_ROW_LIMIT = 65_000;

/**
 * distinct_ids are our users.id UUIDs (posthog.identify), but anonymous
 * posthog-js ids are UUIDs too — the real membership test is the intersection
 * with DB user ids performed by callers.
 */
const UUID_PATTERN =
	"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const DESKTOP_EVENTS = [
	"desktop_opened",
	"workspace_created",
	"workspace_opened",
	"project_opened",
	"terminal_opened",
] as const;
const CLI_EVENTS = ["cli_command_invoked", "command_run"] as const;
const CHAT_EVENTS = [
	"chat_message_sent",
	"chat_session_created",
	"chat_session_opened",
	"agent_session_launch",
] as const;

export function quoteEventList(events: readonly string[]): string {
	return events.map((event) => `'${event}'`).join(", ");
}

/**
 * HogQL returns timestamps like "2026-07-12T10:33:21Z",
 * "2026-07-12 10:33:21" (project timezone is UTC), or bare dates. Normalize
 * to an explicit-UTC ISO string before parsing.
 */
export function parseHogDate(value: string): Date {
	let normalized = value.replace(" ", "T");
	if (!/[Zz]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
		normalized = normalized.includes("T")
			? `${normalized}Z`
			: `${normalized}T00:00:00Z`;
	}
	return new Date(normalized);
}

type SnapshotRow = [
	string,
	string,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

async function fetchSnapshot(): Promise<ActivitySnapshot> {
	const sql = `
SELECT
  distinct_id,
  max(timestamp) AS last_ts,
  countIf(timestamp >= now() - INTERVAL 7 DAY) AS events_7d,
  countIf(timestamp >= now() - INTERVAL 30 DAY) AS events_30d,
  countIf(timestamp >= now() - INTERVAL 60 DAY AND timestamp < now() - INTERVAL 30 DAY) AS events_30d_prev,
  uniqIf(toDate(timestamp), timestamp >= now() - INTERVAL 30 DAY) AS active_days_30,
  countIf(event IN (${quoteEventList(DESKTOP_EVENTS)})) AS desktop_events,
  countIf(event IN (${quoteEventList(CLI_EVENTS)})) AS cli_events,
  countIf(event IN (${quoteEventList(CHAT_EVENTS)})) AS chat_events
FROM events
WHERE timestamp >= now() - INTERVAL 90 DAY
  AND event IN (${quoteEventList(CORE_ACTIVITY_EVENTS)})
  AND match(distinct_id, '${UUID_PATTERN}')
GROUP BY distinct_id
ORDER BY last_ts DESC
LIMIT ${SNAPSHOT_ROW_LIMIT}`;

	const { results } = await executeHogQLQuery<SnapshotRow[]>(sql);

	const byUserId = new Map<string, UserActivity>();
	for (const row of results) {
		const [
			distinctId,
			lastTs,
			events7d,
			events30d,
			events30dPrev,
			activeDays30,
			desktopEvents,
			cliEvents,
			chatEvents,
		] = row;
		byUserId.set(distinctId.toLowerCase(), {
			lastActiveAt: parseHogDate(lastTs),
			events7d: Number(events7d),
			events30d: Number(events30d),
			events30dPrev: Number(events30dPrev),
			activeDays30: Number(activeDays30),
			desktopEvents: Number(desktopEvents),
			cliEvents: Number(cliEvents),
			chatEvents: Number(chatEvents),
		});
	}

	return { fetchedAt: new Date(), byUserId };
}

const MEMO_TTL_MS = 15 * 60 * 1000;

function memoizeAsync<T>(fn: () => Promise<T>): () => Promise<T> {
	let memo: { promise: Promise<T>; expiresAt: number } | null = null;
	return () => {
		if (memo && Date.now() < memo.expiresAt) {
			return memo.promise;
		}
		const promise = fn();
		memo = { promise, expiresAt: Date.now() + MEMO_TTL_MS };
		promise.catch(() => {
			memo = null;
		});
		return promise;
	};
}

export const getActivitySnapshot = memoizeAsync(fetchSnapshot);

async function fetchOrgActivityIndex(): Promise<OrgActivityIndex> {
	const [snapshot, memberRows] = await Promise.all([
		getActivitySnapshot(),
		db
			.select({
				organizationId: members.organizationId,
				userId: members.userId,
			})
			.from(members),
	]);

	const byOrgId = new Map<string, OrgActivity>();
	for (const { organizationId, userId } of memberRows) {
		let org = byOrgId.get(organizationId);
		if (!org) {
			org = {
				memberCount: 0,
				lastActiveAt: null,
				events30d: 0,
				events30dPrev: 0,
				activeMembers7d: 0,
			};
			byOrgId.set(organizationId, org);
		}
		org.memberCount += 1;

		const activity = snapshot.byUserId.get(userId.toLowerCase());
		if (!activity) continue;
		if (!org.lastActiveAt || activity.lastActiveAt > org.lastActiveAt) {
			org.lastActiveAt = activity.lastActiveAt;
		}
		org.events30d += activity.events30d;
		org.events30dPrev += activity.events30dPrev;
		if (activity.events7d > 0) {
			org.activeMembers7d += 1;
		}
	}

	return { fetchedAt: snapshot.fetchedAt, byOrgId };
}

export const getOrgActivityIndex = memoizeAsync(fetchOrgActivityIndex);
