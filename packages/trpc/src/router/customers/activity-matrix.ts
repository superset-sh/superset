import { CORE_ACTIVITY_EVENTS } from "@superset/shared/customer-health";

import { executeHogQLQuery } from "../../lib/posthog-client";
import { quoteEventList } from "./activity-snapshot";

/**
 * Per-user × per-day activity for the company activity matrix (the
 * "GitHub garden" dot plot). One bounded HogQL query per (domain, user set,
 * window) — cached an hour by the PostHog client like every other query.
 *
 * Categories partition the 12 core activity events; `workspace_created` is
 * counted inside the workspace bucket AND surfaced separately as a milestone.
 */

export const MATRIX_USERS_CAP = 200;

const TERMINAL_EVENTS = [
	"cli_command_invoked",
	"command_run",
	"terminal_opened",
] as const;
const CHAT_EVENTS = [
	"chat_message_sent",
	"chat_session_created",
	"chat_session_opened",
	"agent_session_launch",
	"slack_message_sent",
] as const;
const WORKSPACE_EVENTS = [
	"desktop_opened",
	"workspace_opened",
	"project_opened",
	"workspace_created",
] as const;

export interface MatrixDayCell {
	/** UTC calendar day, "YYYY-MM-DD". */
	day: string;
	terminal: number;
	chat: number;
	workspace: number;
	/** workspace_created events that day — a milestone, not routine use. */
	created: number;
}

export async function fetchActivityMatrix(
	userIds: string[],
	days: number,
): Promise<Map<string, MatrixDayCell[]>> {
	// Belt-and-braces: ids come from our own DB, but they are interpolated
	// into HogQL, so re-validate the UUID shape.
	const ids = userIds
		.map((id) => id.toLowerCase())
		.filter((id) => /^[0-9a-f-]{36}$/.test(id))
		.slice(0, MATRIX_USERS_CAP);
	if (ids.length === 0) return new Map();

	const idList = ids.map((id) => `'${id}'`).join(", ");
	// PostHog's query API clamps HogQL to 100 rows unless a LIMIT is explicit —
	// this query returns up to users × days rows, so it MUST carry its own.
	// Newest-first so recent days survive if the limit is ever hit anyway.
	const rowLimit = ids.length * days + 10;
	const sql = `
SELECT
  lower(distinct_id) AS uid,
  toDate(timestamp) AS day,
  countIf(event IN (${quoteEventList(TERMINAL_EVENTS)})) AS terminal,
  countIf(event IN (${quoteEventList(CHAT_EVENTS)})) AS chat,
  countIf(event IN (${quoteEventList(WORKSPACE_EVENTS)})) AS workspace,
  countIf(event = 'workspace_created') AS created
FROM events
WHERE timestamp >= now() - INTERVAL ${days} DAY
  AND event IN (${quoteEventList(CORE_ACTIVITY_EVENTS)})
  AND lower(distinct_id) IN (${idList})
GROUP BY uid, day
ORDER BY day DESC
LIMIT ${rowLimit}`;

	const { results } =
		await executeHogQLQuery<[string, string, number, number, number, number][]>(
			sql,
		);

	const byUser = new Map<string, MatrixDayCell[]>();
	for (const [uid, day, terminal, chat, workspace, created] of results) {
		const cell: MatrixDayCell = {
			day: day.slice(0, 10),
			terminal: Number(terminal),
			chat: Number(chat),
			workspace: Number(workspace),
			created: Number(created),
		};
		const list = byUser.get(uid);
		if (list) {
			list.push(cell);
		} else {
			byUser.set(uid, [cell]);
		}
	}
	return byUser;
}
