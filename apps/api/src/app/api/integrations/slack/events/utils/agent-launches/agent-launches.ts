import { db } from "@superset/db/client";
import { slackAgentLaunches } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { and, eq, isNull, lt } from "drizzle-orm";
import { env } from "@/env";
import type { AgentAction, LaunchedAgentData } from "../slack-blocks";

/** A launch the thread can be told about: on a host, in a terminal to watch. */
export type HostAgentLaunch = LaunchedAgentData & { hostId: string };

export const COMPLETION_JOB_PATH =
	"/api/integrations/slack/jobs/agent-completion";

const FIRST_CHECK_DELAY_SECONDS = 30;
const MAX_CHECK_DELAY_SECONDS = 300;
/** A launch never looked at by now had its first check publish fail. */
const UNSCHEDULED_AFTER_MS = 5 * 60_000;
const UNSCHEDULED_SWEEP_LIMIT = 20;

export function hostLaunchesFromActions(
	actions: AgentAction[],
): HostAgentLaunch[] {
	const launches: HostAgentLaunch[] = [];
	for (const action of actions) {
		if (action.type !== "agent_launched") continue;
		for (const agent of action.agents) {
			if (!agent.hostId || !agent.sessionId || !agent.workspaceId) continue;
			launches.push({ ...agent, hostId: agent.hostId });
		}
	}
	return launches;
}

/** Seconds until the next look at a launch, given how many looks came before. */
export function completionCheckDelaySeconds(polls: number): number {
	return Math.min(
		FIRST_CHECK_DELAY_SECONDS * 2 ** polls,
		MAX_CHECK_DELAY_SECONDS,
	);
}

let qstash: Client | null = null;

function qstashClient(): Client {
	qstash ??= new Client({ token: env.QSTASH_TOKEN });
	return qstash;
}

export async function scheduleCompletionCheck(params: {
	launchId: string;
	polls: number;
}): Promise<void> {
	await qstashClient().publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}${COMPLETION_JOB_PATH}`,
		body: { launchId: params.launchId },
		delay: completionCheckDelaySeconds(params.polls),
		deduplicationId: `slack-agent-launch:${params.launchId}:${params.polls}`,
		retries: 3,
	});
}

/**
 * Remember what a run launched so the thread can hear how it ends. Best
 * effort: the reply must go out whether or not this bookkeeping succeeds.
 */
export async function recordAgentLaunches(params: {
	threadSessionId: string;
	userId: string;
	actions: AgentAction[];
}): Promise<void> {
	const launches = hostLaunchesFromActions(params.actions);
	if (launches.length === 0) return;

	let inserted: { id: string }[];
	try {
		inserted = await db
			.insert(slackAgentLaunches)
			.values(
				launches.map((launch) => ({
					threadSessionId: params.threadSessionId,
					launchedByUserId: params.userId,
					hostId: launch.hostId,
					workspaceId: launch.workspaceId,
					terminalId: launch.sessionId,
					agentLabel: launch.label,
					workspaceName: launch.workspaceName ?? null,
					workspaceBranch: launch.workspaceBranch ?? null,
				})),
			)
			.onConflictDoNothing({
				target: [
					slackAgentLaunches.threadSessionId,
					slackAgentLaunches.terminalId,
				],
			})
			.returning({ id: slackAgentLaunches.id });
	} catch (error) {
		console.error("[slack/agent-launches] Failed to record launches", error);
		return;
	}

	await Promise.all(inserted.map(({ id }) => scheduleFirstCheck(id)));
	await rescheduleUnscheduled();
}

async function scheduleFirstCheck(launchId: string): Promise<void> {
	try {
		await scheduleCompletionCheck({ launchId, polls: 0 });
	} catch (error) {
		console.error(
			"[slack/agent-launches] Failed to schedule completion check",
			{ launchId, error },
		);
	}
}

/**
 * A publish that failed after the insert left a launch nothing will look
 * at. The next launch anywhere picks those up; the QStash id makes a repeat
 * schedule harmless.
 */
async function rescheduleUnscheduled(): Promise<void> {
	try {
		const orphans = await db
			.select({ id: slackAgentLaunches.id })
			.from(slackAgentLaunches)
			.where(
				and(
					eq(slackAgentLaunches.polls, 0),
					isNull(slackAgentLaunches.completedAt),
					lt(
						slackAgentLaunches.launchedAt,
						new Date(Date.now() - UNSCHEDULED_AFTER_MS),
					),
				),
			)
			.limit(UNSCHEDULED_SWEEP_LIMIT);
		await Promise.all((orphans ?? []).map(({ id }) => scheduleFirstCheck(id)));
	} catch (error) {
		console.error("[slack/agent-launches] Orphan sweep failed", error);
	}
}
